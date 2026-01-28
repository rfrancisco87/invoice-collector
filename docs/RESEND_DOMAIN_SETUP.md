# Resend Domain Verification Setup

This guide will help you verify the `seicho.group` domain with Resend so you can send emails from `no-reply@seicho.group`.

## Step 1: Log into Resend Dashboard

1. Go to [https://resend.com/login](https://resend.com/login)
2. Log in with your account

## Step 2: Add Domain

1. Navigate to **Domains** in the left sidebar
2. Click **Add Domain**
3. Enter: `seicho.group`
4. Click **Add**

## Step 3: Configure DNS Records

Resend will provide you with DNS records that need to be added to your domain's DNS settings. You'll need to add:

### Required Records:

1. **SPF Record** (TXT record)
   - Helps prevent email spoofing
   - Example: `v=spf1 include:_spf.resend.com ~all`

2. **DKIM Record** (TXT record)
   - Verifies email authenticity
   - Resend will provide a unique DKIM key
   - Usually at subdomain like `resend._domainkey`

3. **DMARC Record** (TXT record - Optional but recommended)
   - Email authentication policy
   - Example: `v=DMARC1; p=none; rua=mailto:dmarc@seicho.group`

### Where to Add DNS Records:

You need to add these records in your domain registrar or DNS provider for `seicho.group`. Common providers:
- Google Domains
- Cloudflare
- Namecheap
- GoDaddy
- Route53 (AWS)

## Step 4: Verify Domain

1. After adding all DNS records, return to Resend dashboard
2. Click **Verify** next to your domain
3. DNS propagation can take a few minutes to 48 hours (usually < 15 minutes)
4. Once verified, you'll see a green checkmark

## Step 5: Test the Configuration

Once the domain is verified:

1. **Restart your development server**:
   ```bash
   # Stop the current server (Ctrl+C)
   npm run dev
   ```

2. **Test in the app**:
   - Navigate to Settings page
   - Click "Send Test Email"
   - You should receive an email from `Invoice Collector <no-reply@seicho.group>`

## Current Configuration

The app is already configured to use `no-reply@seicho.group`:

- `.env.local` includes: `EMAIL_FROM=Invoice Collector <no-reply@seicho.group>`
- The email library will use this as the sender address

## Temporary Testing (Before Domain Verification)

If you want to test email functionality **before** verifying the domain:

1. Temporarily comment out the EMAIL_FROM in `.env.local`:
   ```bash
   # EMAIL_FROM=Invoice Collector <no-reply@seicho.group>
   ```

2. The app will fall back to Resend's testing domain: `onboarding@resend.dev`
3. This works immediately without domain verification
4. Uncomment EMAIL_FROM after domain verification is complete

## Troubleshooting

### "Domain not verified" error
- Check that all DNS records are added correctly
- Wait a bit longer (DNS propagation can be slow)
- Use a DNS checker tool: https://dnschecker.org

### Test email still fails
1. Ensure development server was restarted after adding EMAIL_FROM
2. Check Resend dashboard logs for detailed error messages
3. Verify API key is correct and active

### Emails go to spam
- Ensure SPF, DKIM, and DMARC records are all properly configured
- Add DMARC record if not already done
- Consider warming up the domain (start with low volume)

## Support

- Resend Documentation: https://resend.com/docs
- Resend Support: support@resend.com
- Check Resend dashboard logs for detailed error information
