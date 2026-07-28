# Invoice Collector

Collects invoices from Gmail, a Google Drive inbox folder, or a forwarding
address; classifies them; files the approved ones into Drive.

Multi-user, invite-only. Each user connects their own Google account, chooses
their own Drive folders, and optionally supplies their own LLM API key so
classification runs on their account rather than a shared one.

---

## Requirements

- Node.js 20+
- A Supabase project (Postgres + Auth)
- A Google Cloud project with the Gmail and Drive APIs enabled
- A [Resend](https://resend.com) account, for invites, password resets and
  notifications
- Optionally: an Anthropic or OpenAI API key, or an n8n webhook, for
  classification

---

## Install

```bash
git clone <repo-url>
cd invoice-colletor
npm install
```

### 1. Environment variables

Create `.env.local`. Every variable below is read somewhere in the app; the
table says what breaks without it.

#### Required

| Variable | What it is | Without it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Nothing works |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. Public by design — it is sent to the browser | Nothing works |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key. **Server-only, never expose** — it bypasses all row-level security | Nothing works |
| `APP_SESSION_SECRET` | Signs the session cookie. Long random string | Login throws |
| `NEXT_PUBLIC_APP_URL` | Public base URL, e.g. `http://localhost:3000` | OAuth callbacks and email links break |
| `GOOGLE_CLIENT_ID` | Google OAuth client id | Cannot connect Gmail or Drive |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Cannot connect Gmail or Drive |

#### Required for the features that use them

| Variable | What it is | Without it |
|---|---|---|
| `ENCRYPTION_KEY` | 32-byte hex key encrypting user LLM API keys at rest | The API-key UI is disabled; keys cannot be saved |
| `RESEND_API_KEY` | Resend API key | No invite, reset or notification emails |
| `EMAIL_FROM` | Sender address on a Resend-verified domain | Emails fail silently — verify the domain |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret for the inbound-email webhook | `/api/inbound-email` returns 401 for everything. **Fails closed on purpose** — that signature is the only authentication on the route |
| `CRON_SECRET` | Bearer token for `/api/cron/sync` | Automated sync returns 401 |

#### Optional

| Variable | What it is |
|---|---|
| `GOOGLE_REDIRECT_URI` | Only used when reprocessing a document through the webhook |
| `WEBHOOK_URL` | Read only by `scripts/backfill-webhook-url.ts`. The app no longer falls back to a shared webhook — classification endpoints are per-user |

Generate the two secrets:

```bash
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -hex 32   # APP_SESSION_SECRET
```

> **`ENCRYPTION_KEY` cannot be rotated casually.** It decrypts stored LLM API
> keys. Change it and every saved key becomes unreadable — users are told to
> re-enter theirs. Back it up with your other secrets.

### 2. Google OAuth

In Google Cloud Console:

1. Enable the **Gmail API** and **Google Drive API**.
2. Create an OAuth 2.0 Client ID (Web application).
3. Add an authorised redirect URI:
   `<NEXT_PUBLIC_APP_URL>/api/gmail/callback`

### 3. Database

#### Fresh install

1. Create a new Supabase project. Note the project URL and both API keys from
   **Project Settings → API**.
2. Generate the consolidated schema:

   ```bash
   npx tsx scripts/build-schema.ts
   ```

   This writes `supabase/schema.sql` — every migration concatenated in
   execution order.
3. Open **SQL Editor** in the Supabase dashboard, paste the whole file, run it.
4. Verify:

   ```bash
   npx tsx scripts/check-migrations.ts
   ```

   It should print `All migrations applied.`

> **`supabase/schema.sql` is for empty projects only.** Its first section drops
> the core tables before recreating them. Never run it against a database
> holding real data.

#### Why not just run the directory in order

Don't. `supabase/migrations/` is not a clean migration set:

- **Filename order is not execution order.**
  `20240204_multisource_schema.sql` sorts after `018` but must run before it,
  and `database/app-auth.sql` depends on the `profiles` table from `010`.
- **The SQL lives in two directories.** `database/app-auth.sql` creates
  `app_credentials`, which holds the password hashes — miss it and nobody can
  log in.
- **Six files are not migrations.** Three of them —
  `cleanup-database.sql`, `cleanup_db.sql`, `force-cleanup.sql` — delete data.
  Running the directory alphabetically wipes the database halfway through
  setup.

`scripts/build-schema.ts` encodes the correct order and excludes those files.
It also fails if a new `.sql` file appears that is neither ordered nor
explicitly excluded, so the ordering cannot silently rot.

#### Updating an existing database

Do **not** use `schema.sql`. Run only the migrations you are missing:

```bash
npx tsx scripts/check-migrations.ts
```

It names the missing tables and columns and which file supplies them. Apply
those files individually in the SQL editor. Run this first whenever something
fails oddly — a missing migration usually surfaces as an opaque 500 rather than
anything naming the cause.

### 4. Create the first admin

Signup is invite-only and invites can only be issued by an admin, so a fresh
install needs one account bootstrapped from the command line:

```bash
npx tsx scripts/create-admin.ts you@example.com your-long-password
```

Re-running for an existing address promotes that account to admin and resets
its password — also the recovery path if you are ever locked out.

### 5. Run

```bash
npm run dev
```

Log in at `/login`, then complete setup: connect Google, pick a Drive folder,
choose your sources. Invite others from `/admin`.

---

## Classification

Documents pass through three layers:

1. **Pre-filter** — deterministic, runs on filename/subject/sender before any
   upload or API call. Discards bank statements, contracts, payslips, tickets
   and quotes for free. Deliberately conservative: it only skips when there is
   no invoice signal anywhere, because losing a real invoice is worse than
   making you reject one extra document.
2. **Classifier** — your n8n webhook, or Anthropic, or OpenAI. Chosen per user
   in Settings.
3. **Confidence gate** — results below your threshold are kept and flagged
   *Rever* rather than trusted or silently discarded.

**Rules** (Settings → Regras de Classificação) layer your own knowledge on top:
skip a sender entirely, force a verdict, or give the model a plain-language
instruction such as *"documents from my accountant are never invoices"*.

**Invoice/receipt pairing** — senders like Stripe attach both to one email.
They are detected as one transaction and resolved by your
`duplicate_pair_default` preference, which defaults to keeping the invoice.

### Bring your own LLM key

Settings → *Chave de API para Classificação*. Keys are validated against the
provider before being stored (via a free model-listing endpoint, so validating
costs nothing), encrypted with AES-256-GCM, and never returned to the browser
afterwards — only a `sk-ant-…4f2a` style hint.

Costs land on your own provider account. `llm_usage` records tokens per call,
including failed calls, which are billed too.

---

## Scheduled sync

`/api/cron/sync` runs the sweep for every user whose auto-sync is due. Protect
it with `CRON_SECRET`:

```
Authorization: Bearer <CRON_SECRET>
```

On Vercel, add a cron entry pointing at it. Free-tier users sync every 12
hours, paid every 15 minutes.

---

## Scripts

| Script | Purpose |
|---|---|
| `build-schema.ts` | Concatenate all SQL into `supabase/schema.sql` in execution order, for fresh installs |
| `check-migrations.ts` | Which migrations are applied, and what is missing |
| `create-admin.ts` | Create or promote an admin account |
| `audit-tenant-scoping.ts` | Fails if any query on a user-owned table lacks an owner filter |
| `verify-crypto.ts` | API-key encryption properties |
| `verify-prefilter.ts` | Pre-filter decisions |
| `verify-pairing.ts` | Invoice/receipt pairing |
| `verify-rules.ts` | Rule matching, precedence, regex safety |
| `verify-webhook-signature.ts` | Inbound webhook signature verification |
| `backfill-webhook-url.ts` | One-off: pin existing users to the old shared `WEBHOOK_URL` |

Run everything before shipping a change:

```bash
for s in check-migrations audit-tenant-scoping verify-crypto verify-prefilter \
         verify-pairing verify-rules verify-webhook-signature; do
  npx tsx scripts/$s.ts
done

npm run type-check
npm run lint
npm run build
```

---

## Security notes

- Server-side Supabase clients use the **service role**, so row-level security
  does not apply. Tenant isolation depends on every query filtering by
  `user_id`. `lib/supabase/scoped.ts` makes that structural, and
  `scripts/audit-tenant-scoping.ts` fails if a query bypasses it.
- `/api/inbound-email` is exempt from the session check — its Svix signature is
  its authentication, and it fails closed when `RESEND_WEBHOOK_SECRET` is unset.
- Password reset tokens are stored only as SHA-256 hashes; the plaintext exists
  solely in the email that was sent.
- User-supplied regexes in rules are length-capped, rejected if they contain
  nested quantifiers, and matched against truncated input — an unguarded
  pattern would hang the sync sweep for every user.
- **Never commit `.env.local`.** If a service-role key is ever exposed, rotate
  it in Supabase immediately; it grants full database access.
