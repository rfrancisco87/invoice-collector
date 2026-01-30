-- Migration 013: Move cron job to Supabase using pg_cron + pg_net
-- This replaces Vercel Cron for auto-sync functionality

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a table to store cron configuration
CREATE TABLE IF NOT EXISTS cron_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the app URL and cron secret (these need to be updated with actual values)
-- You'll need to update these after running the migration
INSERT INTO cron_config (key, value) VALUES
  ('app_url', 'https://your-app-url.vercel.app'),
  ('cron_secret', 'your-cron-secret-here')
ON CONFLICT (key) DO NOTHING;

-- Create a function to trigger the sync API
CREATE OR REPLACE FUNCTION trigger_auto_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  app_url TEXT;
  cron_secret TEXT;
  request_id BIGINT;
BEGIN
  -- Get configuration
  SELECT value INTO app_url FROM cron_config WHERE key = 'app_url';
  SELECT value INTO cron_secret FROM cron_config WHERE key = 'cron_secret';

  -- Check if configuration exists
  IF app_url IS NULL OR cron_secret IS NULL THEN
    RAISE NOTICE 'Cron config not set. Please update cron_config table with app_url and cron_secret.';
    RETURN;
  END IF;

  -- Make HTTP request to the sync API
  SELECT net.http_post(
    url := app_url || '/api/cron/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  RAISE NOTICE 'Auto-sync triggered, request_id: %', request_id;
END;
$$;

-- Schedule the cron job to run every 15 minutes
-- Note: pg_cron uses UTC timezone
SELECT cron.schedule(
  'auto-sync-invoices',           -- job name
  '*/15 * * * *',                 -- every 15 minutes
  $$SELECT trigger_auto_sync()$$  -- function to call
);

-- Create a helper function to manually trigger sync (useful for testing)
CREATE OR REPLACE FUNCTION manual_trigger_sync()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM trigger_auto_sync();
  RETURN 'Sync triggered. Check sync_jobs table for results.';
END;
$$;

-- Create a view to see cron job status
CREATE OR REPLACE VIEW cron_job_status AS
SELECT
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
WHERE jobname = 'auto-sync-invoices';

-- Create a view to see recent cron runs
CREATE OR REPLACE VIEW cron_job_runs AS
SELECT
  runid,
  jobid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 50;

-- Grant access to the views for authenticated users (admins can check status)
GRANT SELECT ON cron_job_status TO authenticated;
GRANT SELECT ON cron_job_runs TO authenticated;

-- Add RLS to cron_config (only service role can modify)
ALTER TABLE cron_config ENABLE ROW LEVEL SECURITY;

-- No policies = only service role can access
-- This is intentional for security

-- Add comment explaining how to update config
COMMENT ON TABLE cron_config IS 'Configuration for cron jobs. Update app_url and cron_secret via SQL Editor or service role.';
