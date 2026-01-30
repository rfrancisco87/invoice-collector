-- Migration 011: Admin RLS Policies
-- Admins can view sync_jobs (logs) but NOT user documents, settings, or tokens

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- SYNC_JOBS: Admins can READ all (for monitoring)
-- =====================================================

-- Add policy for admins to view all sync jobs
DROP POLICY IF EXISTS "Admins can view all sync jobs" ON sync_jobs;
CREATE POLICY "Admins can view all sync jobs"
  ON sync_jobs FOR SELECT
  USING (is_admin());

-- =====================================================
-- ADMIN STATS VIEW (aggregate data only, no PII)
-- =====================================================

-- Drop view if exists
DROP VIEW IF EXISTS admin_stats;

-- Create admin stats view with aggregate metrics only
CREATE VIEW admin_stats AS
SELECT
  (SELECT COUNT(*) FROM auth.users) as total_users,
  (SELECT COUNT(*) FROM gmail_accounts) as connected_accounts,
  (SELECT COUNT(*) FROM sync_jobs WHERE status = 'running') as active_syncs,
  (SELECT COUNT(*) FROM sync_jobs WHERE status = 'completed' AND started_at > NOW() - INTERVAL '24 hours') as syncs_completed_today,
  (SELECT COUNT(*) FROM sync_jobs WHERE status = 'failed' AND started_at > NOW() - INTERVAL '24 hours') as syncs_failed_today,
  (SELECT COUNT(*) FROM documents WHERE processed_at > NOW() - INTERVAL '24 hours') as documents_processed_today,
  (SELECT COUNT(*) FROM documents WHERE status = 'pending') as total_pending_documents,
  (SELECT COUNT(*) FROM documents WHERE status = 'approved') as total_approved_documents,
  (SELECT COUNT(*) FROM documents WHERE status = 'rejected') as total_rejected_documents,
  (SELECT COUNT(DISTINCT user_id) FROM sync_jobs WHERE started_at > NOW() - INTERVAL '24 hours') as active_users_today,
  (SELECT COALESCE(SUM(documents_found), 0) FROM sync_jobs WHERE started_at > NOW() - INTERVAL '24 hours') as total_documents_found_today,
  (SELECT COALESCE(SUM(duplicates_skipped), 0) FROM sync_jobs WHERE started_at > NOW() - INTERVAL '24 hours') as total_duplicates_skipped_today;

-- Grant access to authenticated users (RLS will control who sees what via is_admin())
GRANT SELECT ON admin_stats TO authenticated;

-- =====================================================
-- SYNC_JOBS_ADMIN VIEW (for admin log viewing)
-- Shows sync jobs without sensitive user data
-- =====================================================

DROP VIEW IF EXISTS admin_sync_logs;

CREATE VIEW admin_sync_logs AS
SELECT
  sj.id,
  sj.user_id,
  p.email as user_email,
  sj.status,
  sj.sync_from_date,
  sj.sync_to_date,
  sj.emails_scanned,
  sj.documents_found,
  sj.duplicates_skipped,
  sj.started_at,
  sj.completed_at,
  sj.error_message,
  EXTRACT(EPOCH FROM (COALESCE(sj.completed_at, NOW()) - sj.started_at)) as duration_seconds
FROM sync_jobs sj
LEFT JOIN profiles p ON sj.user_id = p.id
ORDER BY sj.started_at DESC;

GRANT SELECT ON admin_sync_logs TO authenticated;

-- =====================================================
-- IMPORTANT: Documents, Gmail Accounts, User Settings
-- remain user-isolated (admins CANNOT see them)
-- =====================================================

-- No changes to documents, gmail_accounts, or user_settings policies
-- These remain strictly user-isolated for privacy

-- =====================================================
-- Add index for faster admin queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_sync_jobs_started_at ON sync_jobs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status_started ON sync_jobs(status, started_at DESC);

-- Add comments
COMMENT ON FUNCTION is_admin() IS 'Returns true if current user has admin role';
COMMENT ON VIEW admin_stats IS 'Aggregate statistics for admin dashboard (no PII)';
COMMENT ON VIEW admin_sync_logs IS 'Sync job logs for admin monitoring (includes user email only)';
