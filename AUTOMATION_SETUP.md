# Automated Sync & Email Notifications - Setup Guide

This guide will help you set up automated email syncing and notifications for the Invoice Collector application.

## Overview

The automation features include:
- **Automated Sync**: Hourly cron job to scan Gmail for new invoices
- **Email Notifications**: Get notified when new documents are detected
- **Configurable Settings**: Control sync frequency and notification preferences

## Prerequisites

1. **Resend Account** (for email notifications)
   - Sign up at [resend.com](https://resend.com)
   - Get your API key from the dashboard
   - Verify your sending domain (or use the sandbox domain for testing)

2. **Cron Service** (for automated sync)
   - Option A: Vercel Cron (if deploying to Vercel)
   - Option B: External service like cron-job.org, EasyCron, etc.

3. **Supabase Service Role Key**
   - Go to your Supabase project settings
   - Navigate to API → Service Role Key
   - Copy the service role key (NOT the anon key)

## Step 1: Install Dependencies

```bash
npm install resend @supabase/supabase-js
```

## Step 2: Run Database Migration

Apply the database migration to add notification settings:

```bash
# Using Supabase CLI
supabase migration up

# Or manually run the SQL in supabase/migrations/003_add_notifications.sql
```

This adds the following columns to `user_settings`:
- `auto_sync_enabled` - Enable/disable automatic syncing
- `email_notifications_enabled` - Enable/disable email notifications
- `notification_email` - Custom email address for notifications
- `last_auto_sync_at` - Timestamp of last successful auto-sync

## Step 3: Configure Environment Variables

Add the following to your `.env.local` file:

```env
# Existing variables
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# New variables for automation
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM="Invoice Collector <notifications@yourdomain.com>"
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=your-random-secret-string
```

### Generating a CRON_SECRET

```bash
# On macOS/Linux
openssl rand -base64 32

# Or use any strong random string generator
```

## Step 4: Setup Automated Sync (Choose One Option)

### Option A: Vercel Cron (Recommended for Vercel deployments)

The `vercel.json` file is already configured to run the cron job hourly.

**No additional setup required** - just deploy to Vercel and the cron will run automatically.

To verify it's working:
1. Deploy to Vercel
2. Go to your Vercel project → Settings → Crons
3. You should see `/api/cron/sync` scheduled to run every hour

### Option B: External Cron Service

If you're not using Vercel, use an external cron service:

#### Using cron-job.org (Free)

1. Sign up at [cron-job.org](https://cron-job.org)
2. Create a new cron job with these settings:
   - **URL**: `https://yourdomain.com/api/cron/sync`
   - **Schedule**: `0 * * * *` (every hour)
   - **HTTP Method**: POST
   - **Authentication**: Add header `Authorization: Bearer YOUR_CRON_SECRET`

3. Save and enable the cron job

#### Using GitHub Actions (Free)

Create `.github/workflows/sync.yml`:

```yaml
name: Automated Sync

on:
  schedule:
    - cron: '0 * * * *'  # Every hour
  workflow_dispatch:  # Allow manual triggers

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger sync
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://yourdomain.com/api/cron/sync
```

Add `CRON_SECRET` to your GitHub repository secrets.

## Step 5: Configure Resend Email Domain

### For Testing (Sandbox Domain)

Resend provides a sandbox domain for testing:
- Use `notifications@resend.dev` as your FROM address
- Emails will only be sent to your verified email address

### For Production (Custom Domain)

1. Add your domain in Resend dashboard
2. Add the required DNS records to your domain:
   - SPF record
   - DKIM record
   - DMARC record (recommended)
3. Wait for verification (usually < 24 hours)
4. Update `EMAIL_FROM` in your environment variables

## Step 6: Enable Notifications in App

1. Log into the application
2. Go to Settings
3. Configure your preferences:
   - **Sync days back**: How far to look for invoices (1-30 days)
   - **Enable automatic sync**: Turn on/off hourly syncing
   - **Send email notifications**: Enable email alerts
   - **Notification email**: Custom email address (optional)
4. Click "Send Test Email" to verify email configuration
5. Save settings

## Testing

### Test Email Notifications

1. Go to Settings page
2. Enable "Send email notifications"
3. Click "Send Test Email"
4. Check your inbox for the test email

### Test Automated Sync

#### Manual Trigger (for testing)

You can manually trigger the cron job:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://yourdomain.com/api/cron/sync
```

#### Check Logs

- **Vercel**: Project → Deployments → Functions → `/api/cron/sync`
- **External cron**: Check your cron service's execution logs

### Verify It's Working

1. Send yourself an email with a PDF invoice
2. Wait for the next hourly sync (or manually trigger)
3. Check your email for notification
4. Check dashboard for new pending documents

## Troubleshooting

### Emails Not Sending

**Check Resend API key**:
- Verify `RESEND_API_KEY` is set correctly
- Check Resend dashboard for failed sends
- Make sure FROM email domain is verified

**Check notification settings**:
- Ensure "Send email notifications" is enabled
- Verify notification email address is correct

**Check application logs**:
- Look for email-related errors in deployment logs

### Cron Not Running

**For Vercel Cron**:
- Check project → Settings → Crons
- Verify cron is enabled
- Check function logs for errors

**For External Cron**:
- Verify cron job is enabled in service
- Check cron service execution logs
- Verify `Authorization` header is set correctly
- Ensure `CRON_SECRET` matches in both places

**Check endpoint manually**:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -v \
  https://yourdomain.com/api/cron/sync
```

Should return: `{"success": true, "processed": N, "results": [...]}`

### No Documents Being Synced

- Check that users have `auto_sync_enabled = true` in database
- Verify Gmail tokens are not expired
- Check sync_days_back setting
- Verify emails contain invoice keywords
- Check cron job execution logs for errors

## Environment-Specific Setup

### Development

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
EMAIL_FROM="Dev Invoice Collector <notifications@resend.dev>"
```

Use manual curl commands to trigger sync instead of cron.

### Staging

```env
NEXT_PUBLIC_APP_URL=https://staging.yourdomain.com
EMAIL_FROM="Staging Invoices <staging@yourdomain.com>"
```

Set up a separate cron job for staging environment.

### Production

```env
NEXT_PUBLIC_APP_URL=https://yourdomain.com
EMAIL_FROM="Invoice Collector <notifications@yourdomain.com>"
```

Use Vercel Cron or production cron service.

## Security Notes

1. **Never commit secrets** - Use environment variables
2. **Protect cron endpoint** - Always verify `CRON_SECRET`
3. **Use HTTPS** - Required for cron webhook
4. **Service role key** - Keep this secret, it bypasses RLS
5. **Email rate limits** - Resend has rate limits, monitor usage

## Cost Estimates

### Resend Pricing
- **Free tier**: 3,000 emails/month, 100 emails/day
- **Paid plans**: Start at $20/month for 50,000 emails

### Vercel Cron
- **Hobby plan**: 100 hours/month of function execution
- **Pro plan**: 1,000 hours/month
- Hourly cron = ~720 executions/month

### External Cron Services
- **cron-job.org**: Free for basic needs
- **EasyCron**: Free for 1-2 jobs
- **GitHub Actions**: 2,000 minutes/month free

## Monitoring

### Recommended Monitoring

1. **Email delivery** - Check Resend dashboard regularly
2. **Cron execution** - Monitor cron service logs
3. **Error alerts** - Set up alerts for failed syncs
4. **Database growth** - Monitor documents table size

### Supabase Query for Monitoring

```sql
-- Check recent auto-syncs
SELECT
  user_id,
  last_auto_sync_at,
  auto_sync_enabled,
  email_notifications_enabled
FROM user_settings
WHERE auto_sync_enabled = true;

-- Check recent sync jobs
SELECT
  created_at,
  status,
  documents_found,
  duplicates_skipped,
  completed_at
FROM sync_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

## Support

If you encounter issues:
1. Check this guide's troubleshooting section
2. Review application logs
3. Check Resend dashboard for email delivery status
4. Verify all environment variables are set correctly
