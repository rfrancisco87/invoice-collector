-- Migration 028: Close the self-signup bypass and make sessions revocable
--
-- 1. handle_new_user() created an *active* profile for every auth.users row
--    (profiles.status defaults to 'active' since 019). Anyone holding the
--    public anon key could call supabase.auth.signUp(), get an active profile,
--    then use forgot-password/reset-password to mint app credentials — a full
--    account with no invite. New rows now start as 'invited'; the invite-only
--    signup route (app/api/auth/signup) promotes its own users to 'active'
--    explicitly once the invite is validated.
--
-- 2. Session cookies are stateless HMAC tokens valid for 30 days, so
--    suspending a user or resetting a leaked password left existing sessions
--    working. profiles.session_version is embedded in the token and compared
--    on every request; bumping it invalidates every outstanding session.

-- ---------------------------------------------------------------------------
-- 1. Self-signup no longer yields an active profile
-- ---------------------------------------------------------------------------

-- Belt and braces: even a code path that inserts a profile without naming the
-- status now gets the inert state.
ALTER TABLE profiles ALTER COLUMN status SET DEFAULT 'invited';

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, onboarding_completed, onboarding_step, demo_invoice_created, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    false,
    0,
    false,
    'invited'
  )
  -- status deliberately not touched on conflict: re-creating an auth user
  -- must not demote (or promote) an existing account.
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 2. Revocable sessions
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.session_version IS
  'Embedded in the signed session cookie. Incrementing it logs the user out everywhere. Bumped automatically on status change and password change.';

-- Bumped in the database rather than in each route, so a suspension or
-- password change made from the Supabase SQL editor / dashboard revokes
-- sessions just as reliably as one made through the app.

CREATE OR REPLACE FUNCTION bump_session_version_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.session_version := OLD.session_version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS profiles_bump_session_version ON profiles;
CREATE TRIGGER profiles_bump_session_version
  BEFORE UPDATE OF status ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION bump_session_version_on_status_change();

CREATE OR REPLACE FUNCTION bump_session_version_on_password_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Inserts count too: reset-password upserts, and the first credential row
  -- for an account should not honour any session issued before it existed.
  IF TG_OP = 'INSERT' OR NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
    UPDATE public.profiles
      SET session_version = session_version + 1
      WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS app_credentials_bump_session_version ON app_credentials;
CREATE TRIGGER app_credentials_bump_session_version
  AFTER INSERT OR UPDATE OF password_hash ON app_credentials
  FOR EACH ROW
  EXECUTE FUNCTION bump_session_version_on_password_change();

