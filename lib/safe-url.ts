/**
 * SSRF guard for user-configured outbound URLs (currently the n8n webhook).
 *
 * A string check on the hostname is not enough: a public DNS name can resolve
 * to 127.0.0.1 or 169.254.169.254, and it can re-resolve to a different address
 * between "validate" and "connect" (DNS rebinding). So this module does two
 * things:
 *
 *   1. assertSafeOutboundUrl()  - parse, enforce protocol, resolve every
 *      address the name points at, and reject if ANY of them is non-public.
 *      Used at save time (settings) and before each request.
 *   2. safeLookup               - a drop-in `lookup` for node:http(s) that runs
 *      the same address check at connect time, so the socket can only ever be
 *      opened to an address that passed validation.
 */

import { BlockList, isIP } from 'node:net'
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns'
import { promises as dnsPromises } from 'node:dns'

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

// Non-public IPv4 ranges (RFC 6890 special-purpose registry, plus multicast and
// reserved). Anything here is either internal, unroutable, or never a
// legitimate webhook target.
const IPV4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"; 0.0.0.0 reaches localhost on Linux
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT, also used by some cloud internal networks
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, includes cloud metadata 169.254.169.254
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]

const IPV6_BLOCKED: Array<[string, number]> = [
  ['::', 96], // unspecified, loopback, deprecated IPv4-compatible
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard-only
  ['2001::', 23], // IETF protocol assignments (incl. Teredo)
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local (ULA)
  ['fe80::', 10], // link-local
  ['fec0::', 10], // deprecated site-local
  ['ff00::', 8], // multicast
]

const blockList = new BlockList()
for (const [net, prefix] of IPV4_BLOCKED) blockList.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of IPV6_BLOCKED) blockList.addSubnet(net, prefix, 'ipv6')

/** Expand an IPv6 literal into its 8 16-bit groups. Returns null if malformed. */
function ipv6Groups(ip: string): number[] | null {
  let addr = ip.split('%')[0] // drop zone id
  // Trailing dotted-quad form (e.g. ::ffff:127.0.0.1)
  const dotted = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    const o = dotted[2].split('.').map(Number)
    addr = `${dotted[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`
  }
  const halves = addr.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  const groups = [...head, ...Array(fill).fill('0'), ...tail].map((g) => parseInt(g, 16))
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null
}

function v4FromGroups(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
}

/** True if the address is anything other than a routable public unicast IP. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return blockList.check(ip, 'ipv4')
  if (family !== 6) return true // not an IP at all: fail closed

  const g = ipv6Groups(ip)
  if (!g) return true

  // Addresses that embed an IPv4 address are judged by that IPv4 address,
  // otherwise ::ffff:127.0.0.1 or a NAT64/6to4 wrapper would slip through.
  const isMapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff
  const isNat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)
  if (isMapped || isNat64) return blockList.check(v4FromGroups(g[6], g[7]), 'ipv4')
  if (g[0] === 0x2002) return blockList.check(v4FromGroups(g[1], g[2]), 'ipv4') // 6to4

  return blockList.check(ip, 'ipv6')
}

/**
 * Validate a user-supplied outbound URL. Resolves DNS and rejects if any
 * resolved address is non-public. Throws UnsafeUrlError with a user-facing
 * message on failure.
 */
export async function assertSafeOutboundUrl(urlString: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw new UnsafeUrlError('Invalid webhook URL format')
  }

  // Plain http is tolerated outside production so local development against a
  // tunnel/staging n8n keeps working; in production the PDF payloads (invoices)
  // must not travel in clear text.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeUrlError('Webhook URL must use HTTPS')
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Webhook URL must use HTTPS')
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Webhook URL must not contain credentials')
  }

  // URL.hostname keeps the brackets around IPv6 literals ("[::1]").
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!hostname) throw new UnsafeUrlError('Invalid webhook URL format')

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.goog'
  ) {
    throw new UnsafeUrlError('Webhook URL must point to a public address')
  }

  let addresses: string[]
  if (isIP(hostname)) {
    addresses = [hostname]
  } else {
    try {
      const results = await dnsPromises.lookup(hostname, { all: true, verbatim: true })
      addresses = results.map((r) => r.address)
    } catch {
      throw new UnsafeUrlError('Webhook URL hostname could not be resolved')
    }
  }

  // Reject if ANY address is private: the connection could use any of them.
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new UnsafeUrlError('Webhook URL must point to a public address')
  }

  return url
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number
) => void

/**
 * `lookup` for node:http(s) request options. Re-validates the resolved
 * addresses at connect time so a DNS answer that changed after
 * assertSafeOutboundUrl() (rebinding) cannot reach an internal address.
 * Note: Node skips `lookup` for IP-literal hosts, which is why
 * assertSafeOutboundUrl() must always run first.
 */
export function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, [])
    const list = addresses as LookupAddress[]
    if (list.length === 0 || list.some((a) => isBlockedAddress(a.address))) {
      const blocked = new Error('Webhook URL must point to a public address') as NodeJS.ErrnoException
      blocked.code = 'EUNSAFEADDR'
      return callback(blocked, [])
    }
    if (options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}
