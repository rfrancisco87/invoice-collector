# Quick Start - Automated Sync & Notifications

This is a quick reference guide to get automation running. For detailed setup, see [AUTOMATION_SETUP.md](AUTOMATION_SETUP.md).

## 1. Install Dependencies

```bash
npm install resend
```

## 2. Run Database Migration

```bash
# Connect to your Supabase project and run this SQL:
```

Copy and execute the SQL from `supabase/migrations/003_add_notifications.sql` in your Supabase SQL Editor.

## 3. Get API Keys

### Resend (for emails)
1. Go to [resend.com](https://resend.com) and sign up
2. Get your API key from the dashboard
3. For testing, use the sandbox domain: `notifications@resend.dev`

### Supabase Service Role
1. Open your Supabase project
2. Go to Settings → API
3. Copy the "service_role" key (NOT the anon key)

## 4. Update .env.local

Add these new variables:

```env
# Required for cron sync
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Required for email notifications
RESEND_API_KEY=re_your-api-key-here
EMAIL_FROM="Invoice Collector <notifications@resend.dev>"

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron protection (generate with: openssl rand -base64 32)
CRON_SECRET=your-random-secret-here
```

## 5. Test Locally

### Test Email Notifications

1. Run `npm run dev`
2. Go to `http://localhost:3000/settings`
3. Enable "Send email notifications"
4. Click "Send Test Email"
5. Check your inbox!

### Test Cron Endpoint

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/sync
```

Should return: `{"success": true, "processed": N, ...}`

## 6. Deploy & Setup Cron

### Option A: Vercel (Easiest)

1. Deploy to Vercel: `vercel deploy`
2. Add environment variables in Vercel dashboard
3. Done! Cron runs automatically every hour

### Option B: Other Platforms

1. Deploy your app
2. Sign up at [cron-job.org](https://cron-job.org)
3. Create a cron job:
   - URL: `https://yourdomain.com/api/cron/sync`
   - Schedule: Every hour
   - Method: POST
   - Header: `Authorization: Bearer YOUR_CRON_SECRET`

## 7. Enable in App

1. Log into your app
2. Go to Settings
3. Toggle on:
   - ✅ Enable automatic sync
   - ✅ Send email notifications
4. Save

## Done! 🎉

You'll now receive email notifications every hour when new invoices are detected.

## Troubleshooting

**No emails?**
- Check Resend dashboard for delivery logs
- Verify RESEND_API_KEY is correct
- Make sure notifications are enabled in Settings

**Cron not running?**
- For Vercel: Check project → Settings → Crons
- For external: Check cron service logs
- Manually test with curl command above

**Still stuck?**
See [AUTOMATION_SETUP.md](AUTOMATION_SETUP.md) for detailed troubleshooting.
