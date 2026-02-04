-- Secure Cron Views
-- These views share system-wide cron logs and were previously accessible to all authenticated users.
-- This restricts access to only the service_role (backend/admin) to prevent information leakage.

REVOKE SELECT ON cron_job_runs FROM authenticated;
REVOKE SELECT ON cron_job_runs FROM anon;

REVOKE SELECT ON cron_job_status FROM authenticated;
REVOKE SELECT ON cron_job_status FROM anon;

-- Explicitly ensure service_role has access
GRANT SELECT ON cron_job_runs TO service_role;
GRANT SELECT ON cron_job_status TO service_role;
