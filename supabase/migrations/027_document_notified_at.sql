-- Durable "new documents" notifications.
--
-- The email used to be built from an in-memory list at the end of a sync. If
-- the function died after documents were committed (timeout, crash) or Resend
-- rejected the send, those documents were never notified: the next run saw
-- them as duplicates. Notification state now lives on the row, so anything
-- not yet notified is picked up by the next run.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- Existing rows were either already notified or are too old to be news;
-- mark them so the first run after deploy doesn't email the whole backlog.
UPDATE documents SET notified_at = COALESCE(created_at, NOW()) WHERE notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_unnotified
  ON documents (user_id, created_at)
  WHERE notified_at IS NULL;

-- pg_net gives up on a request after 5s by default. The sync sweep runs far
-- longer (maxDuration = 300 on /api/cron/sync), so match it; otherwise the
-- request is abandoned and failures never show up in net._http_response.
-- CREATE OR REPLACE resets function settings, so search_path from 026 is
-- restated here.
CREATE OR REPLACE FUNCTION trigger_auto_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  app_url TEXT;
  cron_secret TEXT;
  request_id BIGINT;
BEGIN
  SELECT value INTO app_url FROM cron_config WHERE key = 'app_url';
  SELECT value INTO cron_secret FROM cron_config WHERE key = 'cron_secret';

  IF app_url IS NULL OR cron_secret IS NULL THEN
    RAISE NOTICE 'Cron config not set. Please update cron_config table with app_url and cron_secret.';
    RETURN;
  END IF;

  SELECT net.http_post(
    url := app_url || '/api/cron/sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) INTO request_id;

  RAISE NOTICE 'Auto-sync triggered, request_id: %', request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION trigger_auto_sync() FROM PUBLIC, anon, authenticated;
