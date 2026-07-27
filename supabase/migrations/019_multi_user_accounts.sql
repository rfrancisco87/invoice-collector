-- Migration 019: Multi-user accounts (invite-only signup + password reset)
--
-- Turns the single-user app into a shared one. Three concerns:
--
--   1. Stop new users inheriting the app owner's infrastructure.
--   2. Give accounts a lifecycle (invited / active / suspended) and a paper
--      trail of who let each person in.
--   3. Back the two credential flows that had no storage: invite codes and
--      password resets.
--
-- Identity note: profiles.id, user_settings.user_id, documents.user_id and
-- gmail_accounts.user_id all reference auth.users(id). Rather than tear out
-- six foreign keys, account creation goes through auth.admin.createUser() and
-- the existing handle_new_user() trigger populates profiles. Supabase Auth
-- stays the identity store; app_credentials + the signed session cookie remain
-- the login mechanism.

-- ---------------------------------------------------------------------------
-- 1. No shared classifier by default
-- ---------------------------------------------------------------------------

-- This column defaulted to the app owner's n8n endpoint, so every new account
-- would classify documents through the owner's instance — their quota, their
-- bill, their logs — without anyone choosing that. New users now start with no
-- classifier until they configure one.
ALTER TABLE user_settings
  ALTER COLUMN webhook_url DROP DEFAULT;

COMMENT ON COLUMN user_settings.webhook_url IS
  'Per-user classification endpoint. NULL means no classifier is configured; documents are stored unclassified rather than falling back to a shared endpoint.';

-- ---------------------------------------------------------------------------
-- 2. Account lifecycle
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE profile_status AS ENUM ('invited', 'active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status profile_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.status IS
  'active = may log in. suspended = credentials valid but access refused. invited = placeholder for a redeemed-but-not-yet-completed signup.';
COMMENT ON COLUMN profiles.invited_by IS
  'Admin whose invite code created this account. NULL for the original owner.';

-- Existing accounts predate invites and are active by definition.
UPDATE profiles SET status = 'active' WHERE status IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Invite codes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Stored in plaintext deliberately: an admin needs to re-read a code to
  -- resend it, and the code is single-use, expiring, and worth only one
  -- account. Password reset tokens below are hashed, because those are
  -- credential-equivalent.
  code TEXT NOT NULL UNIQUE,
  -- Optional: when set, only this address may redeem the code.
  email TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invite_codes_code_idx ON invite_codes (code);
CREATE INDEX IF NOT EXISTS invite_codes_created_by_idx ON invite_codes (created_by);

COMMENT ON TABLE invite_codes IS
  'Single-use signup codes. Redeemable while used_at IS NULL, revoked_at IS NULL and expires_at is in the future.';

-- ---------------------------------------------------------------------------
-- 4. Password reset tokens
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- SHA-256 of the token. The plaintext exists only in the email we send, so a
  -- database read cannot be turned into an account takeover.
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_hash_idx ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_profile_idx ON password_reset_tokens (profile_id);

COMMENT ON TABLE password_reset_tokens IS
  'Single-use password reset tokens. Only the SHA-256 hash is stored.';

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

-- Both tables are credential infrastructure and are only ever touched by
-- server-side service-role code. Enabling RLS with no policies denies all
-- access to the anon and authenticated roles, which is exactly what we want —
-- the same posture as app_credentials (migration 016).
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
