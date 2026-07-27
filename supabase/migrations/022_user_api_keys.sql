-- Migration 022: Per-user LLM API keys
--
-- Each user brings their own provider key so classification runs on their
-- account and their bill, rather than everyone sharing the app owner's
-- infrastructure. This is the storage half; lib/crypto.ts does the encryption
-- and the classifier resolves which backend to use.
--
-- Security posture:
--   * encrypted_key holds AES-256-GCM ciphertext, never plaintext. The
--     encryption key lives in ENCRYPTION_KEY, outside the database, so a
--     database compromise alone does not yield usable provider credentials.
--   * key_hint is the only part ever returned to a client (`sk-ant-…4f2a`).
--   * RLS is enabled with no policies: service-role access only, same posture
--     as app_credentials and password_reset_tokens.

CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  encrypted_key TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  -- Result of the validation call made when the key was saved.
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('unverified', 'valid', 'invalid')),
  last_validated_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One key per provider per user. Saving again replaces the previous key
  -- rather than accumulating stale credentials.
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS user_api_keys_user_idx ON user_api_keys (user_id);

COMMENT ON TABLE user_api_keys IS
  'Per-user LLM provider credentials, encrypted at rest with AES-256-GCM.';
COMMENT ON COLUMN user_api_keys.encrypted_key IS
  'AES-256-GCM ciphertext in the form v1.<iv>.<tag>.<data>. Never return this to a client.';
COMMENT ON COLUMN user_api_keys.key_hint IS
  'Non-secret display fragment, e.g. sk-ant-...4f2a. Safe to send to the browser.';

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_user_api_keys_updated_at ON user_api_keys;
CREATE TRIGGER update_user_api_keys_updated_at
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Which backend classifies this user's documents
-- ---------------------------------------------------------------------------

-- Resolution order is: the named provider's key -> the user's webhook_url ->
-- nothing (documents stored unclassified and flagged for review). Defaulting to
-- 'webhook' keeps every existing user on exactly the path they are on today;
-- adding a key does nothing until this is switched.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS classifier_backend TEXT
    NOT NULL DEFAULT 'webhook'
    CHECK (classifier_backend IN ('webhook', 'anthropic', 'openai'));

COMMENT ON COLUMN user_settings.classifier_backend IS
  'Which classification backend to use. Falls back to webhook_url if the selected provider has no usable key.';
