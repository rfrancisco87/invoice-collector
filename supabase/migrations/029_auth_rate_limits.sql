-- Migration 029: Rate limiting for the public auth endpoints
--
-- login, signup, forgot-password and reset-password are unauthenticated.
-- Without a limit they allow online password guessing and reset-email
-- flooding. The app runs on Vercel serverless, so an in-memory counter would
-- reset on every cold start and is not shared between instances; the counter
-- lives here instead.
--
-- Fixed-window counters keyed by an opaque string chosen by lib/rate-limit.ts
-- (e.g. 'login:ip:1.2.3.4'). Only the service role touches this table.

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- For pruning old windows.
CREATE INDEX IF NOT EXISTS auth_rate_limits_window_start_idx
  ON auth_rate_limits (window_start);

-- RLS on with no policies: anon/authenticated get nothing through PostgREST.
-- The service role bypasses RLS.
ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE auth_rate_limits IS
  'Fixed-window request counters for unauthenticated auth endpoints. Written only via hit_rate_limit().';

-- Records one hit against p_key and reports whether the caller is now over
-- p_max for the current p_window_seconds window. The increment is a single
-- upsert, so concurrent requests cannot both read a stale count and slip
-- under the limit.
CREATE OR REPLACE FUNCTION hit_rate_limit(p_key TEXT, p_window_seconds INTEGER, p_max INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO auth_rate_limits AS r (key, window_start, count)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = r.count + 1
  RETURNING r.count INTO v_count;

  -- Opportunistic cleanup so the table does not grow without bound. Cheap
  -- thanks to the window_start index; a day comfortably exceeds every window
  -- the app uses.
  IF random() < 0.01 THEN
    DELETE FROM auth_rate_limits WHERE window_start < now() - INTERVAL '1 day';
  END IF;

  RETURN v_count > p_max;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- SECURITY DEFINER functions are executable by PUBLIC by default, which would
-- let anyone with the anon key inflate counters for arbitrary keys (i.e. lock
-- other people out). Only the server, via the service role, may call it.
REVOKE EXECUTE ON FUNCTION hit_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION hit_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
