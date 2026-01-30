-- Run this AFTER 013_supabase_cron_sync.sql to set your actual values
-- Replace the placeholder values with your actual configuration

-- Update with your actual app URL
UPDATE cron_config
SET value = 'https://your-actual-app-url.vercel.app', updated_at = NOW()
WHERE key = 'app_url';

-- Update with your actual CRON_SECRET (same value as in your .env.local)
UPDATE cron_config
SET value = 'your-actual-cron-secret', updated_at = NOW()
WHERE key = 'cron_secret';

-- Verify the configuration
SELECT * FROM cron_config;

-- Test the sync manually (optional)
-- SELECT manual_trigger_sync();
