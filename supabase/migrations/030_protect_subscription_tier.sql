-- The settings API no longer accepts subscription_tier, but the
-- "Users can manage own settings" RLS policy is FOR ALL, so anyone holding a
-- Supabase user JWT could still PATCH user_settings through PostgREST and
-- upgrade themselves. sync_frequency_minutes needs the same protection: the
-- cron uses it for free-tier users, so writing 1 there is an upgrade too.
-- Only the service role (the app's server code) or a direct SQL session may
-- change either column.

CREATE OR REPLACE FUNCTION protect_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- auth.role() is 'anon' / 'authenticated' for PostgREST user requests,
  -- 'service_role' for the server, and NULL for direct SQL.
  IF COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.subscription_tier := 'free';
    NEW.sync_frequency_minutes := NULL;
  ELSIF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.sync_frequency_minutes IS DISTINCT FROM OLD.sync_frequency_minutes THEN
    RAISE EXCEPTION 'subscription_tier and sync_frequency_minutes can only be changed by the server'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Named to sort before 009's tier trigger, so on INSERT the forced 'free'
-- is what that trigger derives sync_frequency_minutes from.
DROP TRIGGER IF EXISTS a_protect_billing_columns ON user_settings;
CREATE TRIGGER a_protect_billing_columns
  BEFORE INSERT OR UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION protect_billing_columns();
