-- trigger_auto_sync() and manual_trigger_sync() are SECURITY DEFINER and, by
-- Postgres default, executable by PUBLIC. That exposed them through PostgREST
-- (POST /rest/v1/rpc/manual_trigger_sync) to anyone holding the public anon
-- key, letting them fire the cron sweep on demand. Only pg_cron (running as
-- the owner) needs to call them.

REVOKE EXECUTE ON FUNCTION trigger_auto_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION manual_trigger_sync() FROM PUBLIC, anon, authenticated;

-- Pin search_path so a SECURITY DEFINER body can't be hijacked by objects in
-- a caller-controlled schema.
ALTER FUNCTION trigger_auto_sync() SET search_path = public, extensions, net;
ALTER FUNCTION manual_trigger_sync() SET search_path = public, extensions, net;
