# Invoice Collector - Technical Documentation

## Overview

Invoice Collector is a Next.js 14 application that automatically extracts PDF invoices from Gmail, processes them through a webhook (Document AI), and organizes them in Google Drive. The application supports user authentication with email/password or Google OAuth, role-based access control, and comprehensive sync management.

**Language:** Portuguese (pt_PT) for all user-facing text.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [Authentication Flow](#authentication-flow)
6. [Gmail Connection Flow](#gmail-connection-flow)
7. [Email Sync Process](#email-sync-process)
8. [API Routes](#api-routes)
9. [Environment Variables](#environment-variables)
10. [Security & RLS Policies](#security--rls-policies)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User Browser                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Next.js 14 Application                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Pages     │  │    API      │  │ Middleware  │  │   Components    │ │
│  │ (App Router)│  │   Routes    │  │   (Auth)    │  │                 │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐
│    Supabase     │  │   Google APIs   │  │      External Webhook       │
│  ┌───────────┐  │  │  ┌───────────┐  │  │   (Document AI / n8n)       │
│  │  Auth     │  │  │  │  Gmail    │  │  │                             │
│  │  Database │  │  │  │  Drive    │  │  │  - PDF processing           │
│  │  RLS      │  │  │  │  OAuth    │  │  │  - Invoice data extraction  │
│  └───────────┘  │  └───────────┘  │  └─────────────────────────────┘
└─────────────────┘  └─────────────────┘
```

### Data Flow

1. **User authenticates** via Supabase Auth (email/password or Google OAuth with basic scopes)
2. **User connects Gmail** via separate OAuth flow (Gmail + Drive scopes)
3. **Sync process** scans Gmail for PDF attachments
4. **PDFs uploaded** to user's Google Drive folder
5. **Multi-Source Support**:
    - **Gmail Sync**: Scans connected inbox.
    - **Email Forwarding**: Receives emails via Resend webhook.
    - **Drive Inbox**: Scans specific Drive folder for uploads.
6. **Webhook processes** PDFs to extract invoice data (optional)
7. **Documents stored** in Supabase with metadata
8. **User reviews** documents in dashboard (approve/reject/reclassify)

---

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Next.js | 14.2.x |
| Language | TypeScript | 5.7.x |
| Database | Supabase (PostgreSQL) | - |
| Authentication | Supabase Auth | 2.47.x |
| Styling | Tailwind CSS | 3.4.x |
| UI Components | Radix UI | 2.x |
| Icons | Lucide React | 0.460.x |
| API Client | Google APIs | 144.x |
| Email Service | Resend | 4.8.x |
| Form Validation | Zod | 3.23.x |
| Date Handling | date-fns | 4.1.x |

---

## Project Structure

```
invoice-collector/
├── app/                          # Next.js App Router
│   ├── (admin)/                  # Admin route group
│   │   ├── admin/page.tsx        # Admin dashboard (stats only)
│   │   └── layout.tsx            # Admin layout with role check
│   │
│   ├── (dashboard)/              # User dashboard route group
│   │   ├── approved/page.tsx     # Approved documents
│   │   ├── dashboard/page.tsx    # Pending documents
│   │   ├── settings/page.tsx     # User settings
│   │   └── layout.tsx            # Dashboard layout with header/nav
│   │
│   ├── api/                      # API routes
│   │   ├── auth/                 # Authentication routes
│   │   │   ├── google/route.ts   # Google OAuth (basic scopes)
│   │   │   └── logout/route.ts   # Logout handler
│   │   │
│   │   ├── gmail/                # Gmail OAuth routes
│   │   │   ├── connect/route.ts  # Initiate Gmail OAuth
│   │   │   ├── callback/route.ts # Handle Gmail OAuth callback
│   │   │   ├── status/route.ts   # Check permission scopes
│   │   │   └── disconnect/route.ts
│   │   │
│   │   ├── inbound-email/        # Webhook for forwarding
│   │   │   └── route.ts
│   │   │
│   │   ├── drive/                # Google Drive routes
│   │   │   └── folders/          # Folder management
│   │   │
│   │   ├── documents/            # Document management
│   │   │   ├── action/route.ts   # Approve/reject documents
│   │   │   └── reclassify/route.ts
│   │   │
│   │   ├── sync/route.ts         # Main sync endpoint
│   │   ├── cron/sync/route.ts    # Scheduled auto-sync
│   │   └── settings/route.ts     # User settings CRUD
│   │
│   ├── auth/callback/route.ts    # Supabase auth callback
│   ├── forgot-password/page.tsx  # Password recovery
│   ├── reset-password/page.tsx   # Password reset
│   ├── gmail-connect/page.tsx    # Gmail connection page
│   ├── login/page.tsx            # Login page
│   ├── signup/page.tsx           # Registration page
│   ├── setup/page.tsx            # Drive folder setup
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home (redirects)
│
├── components/
│   ├── layout/                   # Layout components
│   │   ├── header.tsx            # Main header with user menu
│   │   ├── internal-nav.tsx      # Dashboard navigation
│   │   └── user-menu.tsx         # User dropdown menu
│   │
│   ├── ui/                       # Radix UI components
│   │   ├── card.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   └── tabs.tsx
│   │
│   ├── document-list.tsx         # Document table/grid
│   ├── gmail-banner.tsx          # Gmail connection prompt
│   ├── settings-form.tsx         # User settings form
│   └── ...
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   └── server.ts             # Server Supabase client
│   │
│   ├── constants.ts              # OAuth scopes definitions
│   ├── gmail.ts                  # Gmail API utilities
│   ├── google-drive.ts           # Drive API utilities
│   ├── token-refresh.ts          # OAuth token refresh logic
│   ├── webhook.ts                # Webhook processing
│   ├── email.ts                  # Resend email utilities
│   └── utils.ts                  # Utility functions (cn, etc.)
│
├── types/
│   └── database.ts               # TypeScript types for Supabase
│
├── supabase/
│   └── migrations/               # Database migrations
│       ├── 003_add_notifications.sql
│       ├── 004_add_webhook_url.sql
│       ├── 005_add_invoice_fields.sql
│       ├── 006_fix_existing_classifications.sql
│       ├── 007_mark_failed_webhooks_for_reprocessing.sql
│       ├── 008_add_gmail_label_setting.sql
│       ├── 009_add_subscription_tier.sql
│       ├── 010_add_profiles_and_roles.sql
│       ├── 011_admin_rls_policies.sql
│       └── 012_add_archive_synced_emails.sql
│
└── middleware.ts                 # Auth middleware
```

---

## Database Schema

### Tables

#### `profiles`
User profiles with role-based access control.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | References auth.users |
| `email` | TEXT | User's email |
| `full_name` | TEXT | Display name |
| `avatar_url` | TEXT | Profile picture URL |
| `role` | user_role | 'user' or 'admin' |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

#### `gmail_accounts`
Connected Gmail accounts with OAuth tokens.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK) | References auth.users |
| `email` | TEXT | Gmail address |
| `access_token` | TEXT | OAuth access token |
| `refresh_token` | TEXT | OAuth refresh token |
| `token_expiry` | TIMESTAMPTZ | Token expiration time |
| `is_primary` | BOOLEAN | Primary account flag |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `user_settings`
User preferences and configuration.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID (PK) | - | Auto-generated |
| `user_id` | UUID (FK) | - | References auth.users |
| `drive_folder_id` | TEXT | NULL | Google Drive folder ID |
| `drive_folder_name` | TEXT | NULL | Drive folder name |
| `drive_folder_path` | TEXT | NULL | Full folder path |
| `sync_days_back` | INTEGER | 30 | Days to sync backwards |
| `auto_sync_enabled` | BOOLEAN | false | Enable automatic sync |
| `email_notifications_enabled` | BOOLEAN | false | Email notifications |
| `notification_email` | TEXT | NULL | Notification email address |
| `webhook_url` | TEXT | NULL | Document processing webhook |
| `gmail_sync_label` | TEXT | NULL | Gmail label for synced emails |
| `archive_synced_emails` | BOOLEAN | false | Archive emails after sync |
| `subscription_tier` | TEXT | 'free' | 'free' or 'paid' |
| `sync_frequency_minutes` | INTEGER | 720 | Auto-sync interval |

#### `documents`
Processed invoice documents.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK) | Owner |
| `gmail_account_id` | UUID (FK) | Source Gmail account |
| `email_message_id` | TEXT | Gmail message ID |
| `file_hash` | TEXT | SHA256 hash (deduplication) |
| `subject` | TEXT | Email subject |
| `sender` | TEXT | Sender email |
| `sender_domain` | TEXT | Sender domain |
| `received_date` | TIMESTAMPTZ | Email received date |
| `filename` | TEXT | Original filename |
| `original_classification` | document_classification | Initial classification |
| `final_classification` | document_classification | User-confirmed classification |
| `confidence_score` | NUMERIC | Classification confidence |
| `was_reclassified` | BOOLEAN | User changed classification |
| `status` | document_status | 'pending', 'approved', 'rejected' |
| `drive_file_id` | TEXT | Google Drive file ID |
| `drive_folder_path` | TEXT | Drive folder path |
| `invoice_number` | TEXT | Extracted invoice number |
| `issue_date` | DATE | Invoice issue date |
| `supplier_name` | TEXT | Vendor name |
| `supplier_vat_number` | TEXT | Vendor VAT/NIF |
| `total_without_vat` | NUMERIC | Net amount |
| `total_vat` | NUMERIC | VAT amount |
| `invoice_total` | NUMERIC | Total amount |
| `currency` | TEXT | Currency code |

#### `sync_jobs`
Email synchronization job records.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK) | Owner |
| `gmail_account_id` | UUID (FK) | Source account |
| `status` | sync_status | 'running', 'completed', 'failed' |
| `sync_from_date` | TIMESTAMPTZ | Sync start date |
| `sync_to_date` | TIMESTAMPTZ | Sync end date |
| `emails_scanned` | INTEGER | Total emails processed |
| `documents_found` | INTEGER | New documents found |
| `duplicates_skipped` | INTEGER | Duplicates ignored |
| `started_at` | TIMESTAMPTZ | Job start time |
| `completed_at` | TIMESTAMPTZ | Job completion time |
| `error_message` | TEXT | Error details if failed |

#### `sender_reputation`
Tracks sender domain reputation based on user feedback.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `user_id` | UUID (FK) | Owner |
| `sender_domain` | TEXT | Domain (e.g., "company.com") |
| `approval_count` | INTEGER | Times approved |
| `rejection_count` | INTEGER | Times rejected |
| `reputation_score` | NUMERIC | Calculated score |
| `is_trusted` | BOOLEAN | Marked as trusted |
| `is_blocked` | BOOLEAN | Marked as blocked |

### Enums

```sql
CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE document_classification AS ENUM ('invoice', 'credit_note', 'unclassified');
CREATE TYPE document_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE sync_status AS ENUM ('running', 'completed', 'failed');
CREATE TYPE feedback_action AS ENUM ('approved', 'rejected', 'reclassified');
```

### Views

#### `admin_stats`
Aggregate statistics for admin dashboard (no PII).

```sql
SELECT
  COUNT(*) FROM auth.users as total_users,
  COUNT(*) FROM gmail_accounts as connected_accounts,
  COUNT(*) FROM sync_jobs WHERE status = 'running' as active_syncs,
  -- etc.
```

#### `admin_sync_logs`
Sync job logs with user email (for admin monitoring).

---

## Authentication Flow

### Step 1: User Registration/Login

The application uses Supabase Auth with two methods:

#### Email/Password
```
/signup → Supabase auth.signUp() → /auth/callback → /dashboard
/login  → Supabase auth.signInWithPassword() → /dashboard
```

#### Google OAuth (Basic Scopes)
```
/login → /api/auth/google → Google OAuth (openid, email, profile)
       → /auth/callback → Supabase session created → /dashboard
```

**Important:** User login does NOT include Gmail/Drive scopes. This is a separate step.

### OAuth Scopes

```typescript
// lib/constants.ts

// For user login only (no Gmail access)
export const GOOGLE_LOGIN_SCOPES = [
  'openid',
  'email',
  'profile',
].join(' ')

// For Gmail connection (after login)
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')
```

### Middleware Protection

```typescript
// middleware.ts
const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password']
const protectedRoutes = ['/dashboard', '/setup', '/settings', '/approved', '/gmail-connect']
const adminRoutes = ['/admin']

// Unauthenticated → redirect to /login
// Authenticated on public route → redirect to /dashboard
// Admin route + not admin role → redirect to /dashboard
```

---

## Gmail Connection Flow

After user login, they must connect their Gmail account separately:

```
1. User clicks "Conectar Gmail" in dashboard
2. /api/gmail/connect → redirects to Google OAuth with GMAIL_SCOPES
3. User authorizes app
4. /api/gmail/callback → exchanges code for tokens
5. Tokens stored in gmail_accounts table
6. User redirected to /setup (or /dashboard if already configured)
7. **Permission Upgrade**: If user enables "Gmail Sync" later, the Wizard detects missing scopes via `/api/gmail/status` and prompts for "Update Permissions", re-triggering the OAuth flow.
```

### Token Refresh

```typescript
// lib/token-refresh.ts
export async function getValidAccessToken(
  currentToken: string | null,
  refreshToken: string | null,
  tokenExpiry: string | null
): Promise<{ accessToken: string; needsUpdate: boolean; newExpiry?: string }>
```

- Automatically refreshes tokens that expire within 5 minutes
- Updates `gmail_accounts` table with new tokens
- Uses correct redirect URI: `${NEXT_PUBLIC_APP_URL}/api/gmail/callback`

---

## Email Sync Process

### Trigger Methods

1. **Manual:** User clicks "Sincronizar" button
2. **Automatic:** Cron job calls `/api/cron/sync` (Vercel Cron)

### Sync Flow

```
POST /api/sync
    │
    ├── 1. Validate user session
    ├── 2. Get user settings & Gmail account
    ├── 3. Refresh OAuth token if needed
    ├── 4. Create sync_job record (status: 'running')
    ├── 5. Create/get Gmail label (if configured)
    │
    ├── 6. Scan Gmail for PDFs
    │       └── Query: has:attachment filename:pdf after:DATE
    │
    ├── 7. For each PDF attachment:
    │       ├── Calculate file hash (SHA256)
    │       ├── Check for duplicates in database
    │       ├── Upload to Drive (Pending Approval folder)
    │       ├── Send to webhook (if configured)
    │       ├── Save document record
    │       ├── Apply Gmail label (if configured)
    │       └── Archive email (if enabled)
    │
    └── 8. Update sync_job (status: 'completed')
```

### Webhook Processing

If `user_settings.webhook_url` is configured, PDFs are sent for processing:

```typescript
// lib/webhook.ts
export async function sendPdfToWebhook(
  pdfBuffer: Buffer,
  filename: string,
  webhookUrl: string
): Promise<WebhookResponse>
```

Expected webhook response:
```typescript
interface WebhookResponse {
  document_type: 'supplier_invoice' | 'credit_note' | string
  invoice_number?: string
  issue_date?: string
  supplier_name?: string
  supplier_vat_number?: string
  total_without_vat?: string
  total_vat?: string
  invoice_total?: string
  currency?: string
  numb_pages?: number
}
```

---

## API Routes

### Authentication

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/google` | GET | Initiate Google OAuth for login |
| `/api/auth/logout` | POST | Sign out user |
| `/auth/callback` | GET | Supabase auth callback |

### Gmail OAuth

| Route | Method | Description |
|-------|--------|-------------|
| `/api/gmail/connect` | GET | Initiate Gmail OAuth (requires auth) |
| `/api/gmail/callback` | GET | Handle Gmail OAuth callback |
| `/api/gmail/disconnect` | POST | Disconnect Gmail account |

### Sync & Documents

| Route | Method | Description |
|-------|--------|-------------|
| `/api/sync` | POST | Trigger email sync |
| `/api/cron/sync` | GET | Cron-triggered auto-sync |
| `/api/documents/action` | POST | Approve/reject document |
| `/api/documents/reclassify` | POST | Change document classification |
| `/api/documents/reprocess-webhook` | POST | Re-send to webhook |

### Settings

| Route | Method | Description |
|-------|--------|-------------|
| `/api/settings` | GET | Get user settings |
| `/api/settings` | PATCH | Update user settings |
| `/api/settings` | POST | Actions (test_email) |

### Drive

| Route | Method | Description |
|-------|--------|-------------|
| `/api/drive/folders` | GET | List Drive folders |
| `/api/drive/folders/create` | POST | Create new folder |
| `/api/drive/folders/save` | POST | Save selected folder |

### Admin

| Route | Method | Description |
|-------|--------|-------------|
| `/api/admin/stats` | GET | Get admin statistics |
| `/api/admin/settings` | PATCH | Update global settings |

---

## Environment Variables

### Required

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # For admin operations

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Or production URL
```

### Optional

```env
# Email notifications (Resend)
RESEND_API_KEY=re_xxx

# Cron authentication
CRON_SECRET=your-secret-key

# Document AI webhook
# (Configured per-user in settings)
```

### Google Cloud Console Setup

1. Create project at https://console.cloud.google.com
2. Enable APIs:
   - Gmail API
   - Google Drive API
3. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs:
     - `http://localhost:3000/api/gmail/callback` (dev)
     - `https://yourdomain.com/api/gmail/callback` (prod)
     - `https://xxx.supabase.co/auth/v1/callback` (Supabase)

---

## Security & RLS Policies

### Row Level Security

All tables have RLS enabled with policies:

```sql
-- Users can only access their own data
CREATE POLICY "Users can view own documents"
ON documents FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
ON documents FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view aggregate data (not individual user data)
CREATE POLICY "Admins can view all sync jobs"
ON sync_jobs FOR SELECT
USING (is_admin());
```

### Admin Access

Admins can:
- View system statistics (aggregate only)
- View sync job logs (for monitoring)

Admins cannot:
- Access individual user documents
- View user settings
- Access user Gmail tokens

### Helper Function

```sql
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Deployment

### Vercel Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 */12 * * *"  // Every 12 hours
    }
  ]
}
```

### Database Migrations

Run migrations in order via Supabase SQL Editor:

```bash
# In Supabase Dashboard → SQL Editor
# Execute each migration file in supabase/migrations/
```

### Production Checklist

- [ ] Set all environment variables in Vercel
- [ ] Configure Google OAuth redirect URIs for production domain
- [ ] Run all database migrations
- [ ] Set admin user role: `UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com'`
- [ ] Test Gmail connection flow
- [ ] Test email sync
- [ ] Configure webhook URL (if using Document AI)

---

## Troubleshooting

### "Google OAuth não está configurado"

**Cause:** `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` environment variables are empty.

**Fix:** Add valid credentials from Google Cloud Console.

### Token refresh errors

**Cause:** Incorrect redirect URI in token refresh.

**Fix:** Ensure `lib/token-refresh.ts` uses:
```typescript
`${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`
```

### Settings not saving

**Cause:** Missing database column.

**Fix:** Run latest migration:
```sql
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS archive_synced_emails BOOLEAN DEFAULT false;
```

### Gmail label not applied

**Cause:** Label name contains special characters or is empty.

**Fix:** Use simple label names without special characters.

---

## Development

### Local Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your values

# Run development server
npm run dev
```

### Type Checking

```bash
npm run type-check
```

### Building

```bash
npm run build
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2024 | Initial MVP |
| 0.2.0 | 2025 | Auth separation, admin roles, UI improvements |
