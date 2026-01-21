/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // For PDF uploads
    },
  },
  images: {
    domains: ['drive.google.com'],
  },
}

module.exports = nextConfig
