-- Migration 025: Recreate the admin dashboard views
--
-- The /admin dashboard showed 0 for every metric against a database holding
-- 4 users, 168 documents and 8047 sync jobs. Cause: admin_stats and
-- admin_sync_logs did not exist. The page reads them with
-- `stats?.total_users || 0`, so a missing view is indistinguishable from a
-- genuinely empty system — it renders zeros instead of failing.
--
-- Recreated here, with three corrections to the original definitions.

DROP VIEW IF EXISTS admin_stats;
DROP VIEW IF EXISTS admin_sync_logs;

-- ---------------------------------------------------------------------------
-- admin_stats
-- ---------------------------------------------------------------------------

CREATE VIEW admin_stats AS
SELECT
  -- Correction 1: count profiles, not auth.users.
  --
  -- profiles is what this application manages; auth.users is the identity
  -- store underneath it. They should agree, but when they disagree the
  -- meaningful number is the one the app can actually act on. Suspended
  -- accounts are excluded because "Utilizadores" on the dashboard means people
  -- who can currently use the system.
  (SELECT COUNT(*) FROM profiles WHERE status <> 'suspended') AS total_users,

  (SELECT COUNT(*) FROM gmail_accounts) AS connected_accounts,
  (SELECT COUNT(*) FROM sync_jobs WHERE status = 'running') AS active_syncs,

  -- Correction 2: "today" means the calendar day, not a rolling 24 hours.
  --
  -- The dashboard labels these "Hoje". A rolling window makes the number drift
  -- during the day and disagree with anything the user counts by hand.
  (SELECT COUNT(*) FROM sync_jobs
    WHERE status = 'completed' AND started_at >= date_trunc('day', NOW())) AS syncs_completed_today,
  (SELECT COUNT(*) FROM sync_jobs
    WHERE status = 'failed' AND started_at >= date_trunc('day', NOW())) AS syncs_failed_today,
  (SELECT COUNT(*) FROM documents
    WHERE processed_at >= date_trunc('day', NOW())) AS documents_processed_today,

  (SELECT COUNT(*) FROM documents WHERE status = 'pending') AS total_pending_documents,
  (SELECT COUNT(*) FROM documents WHERE status = 'approved') AS total_approved_documents,
  (SELECT COUNT(*) FROM documents WHERE status = 'rejected') AS total_rejected_documents,

  (SELECT COUNT(DISTINCT user_id) FROM sync_jobs
    WHERE started_at >= date_trunc('day', NOW())) AS active_users_today,
  (SELECT COALESCE(SUM(documents_found), 0) FROM sync_jobs
    WHERE started_at >= date_trunc('day', NOW())) AS total_documents_found_today,
  (SELECT COALESCE(SUM(duplicates_skipped), 0) FROM sync_jobs
    WHERE started_at >= date_trunc('day', NOW())) AS total_duplicates_skipped_today;

-- ---------------------------------------------------------------------------
-- admin_sync_logs
-- ---------------------------------------------------------------------------

CREATE VIEW admin_sync_logs AS
SELECT
  sj.id,
  sj.user_id,
  p.email AS user_email,
  sj.status,
  sj.sync_from_date,
  sj.sync_to_date,
  sj.emails_scanned,
  sj.documents_found,
  sj.duplicates_skipped,
  sj.started_at,
  sj.completed_at,
  sj.error_message,
  EXTRACT(EPOCH FROM (sj.completed_at - sj.started_at))::INTEGER AS duration_seconds
FROM sync_jobs sj
LEFT JOIN profiles p ON p.id = sj.user_id
ORDER BY sj.started_at DESC;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- Correction 3: do not grant these to `authenticated`.
--
-- The original granted SELECT to authenticated on the assumption that RLS
-- would filter by role. It does not: these are views over aggregates, RLS on
-- the underlying tables is bypassed by the view's owner privileges, and there
-- is no policy on a view to enforce is_admin(). Any logged-in user could read
-- system-wide counts and every user's sync history including their email.
--
-- The application reads these with the service role and separately checks that
-- the caller is an admin (middleware, the /admin layout, and the page itself),
-- so service_role is the only grant needed.
REVOKE ALL ON admin_stats FROM authenticated, anon;
REVOKE ALL ON admin_sync_logs FROM authenticated, anon;

GRANT SELECT ON admin_stats TO service_role;
GRANT SELECT ON admin_sync_logs TO service_role;

COMMENT ON VIEW admin_stats IS
  'Aggregate statistics for the admin dashboard. service_role only — the application enforces the admin role check.';
COMMENT ON VIEW admin_sync_logs IS
  'Recent sync jobs with the owning user''s email. service_role only — contains PII.';
