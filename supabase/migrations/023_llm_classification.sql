-- Migration 023: LLM classification + usage tracking
--
-- Migration 022 stored per-user provider keys. This is what makes them do
-- something: the model to call, and a record of what each call cost.
--
-- Usage tracking is not optional bookkeeping here. Users are spending their own
-- money through their own key, on documents this app decided to send. Without a
-- per-document record of tokens spent there is no way for them to check the
-- bill against what actually happened, and no way to diagnose a
-- misclassification after the fact.

-- ---------------------------------------------------------------------------
-- 1. Model selection
-- ---------------------------------------------------------------------------

-- Nullable: NULL means "use the provider default from lib/classifier/providers".
-- Exposed because model availability changes faster than this codebase does —
-- a user whose account lacks the default model, or who wants a cheaper or
-- stronger one, must be able to fix that without a deploy.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS classifier_model TEXT;

COMMENT ON COLUMN user_settings.classifier_model IS
  'Model id to use for classification. NULL uses the provider default. Set this if the default model is unavailable on your account.';

-- ---------------------------------------------------------------------------
-- 2. Usage log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS llm_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Nullable: a call can fail before any document row exists, and we still want
  -- the spend recorded.
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  -- Whether the call produced a usable classification. Failed calls still cost
  -- money, so they belong in the same ledger.
  succeeded BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS llm_usage_user_created_idx
  ON llm_usage (user_id, created_at DESC);

COMMENT ON TABLE llm_usage IS
  'Per-call record of LLM spend against a user''s own API key. Deliberately includes failed calls, which are billed too.';

ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Record which model classified each document
-- ---------------------------------------------------------------------------

-- classification_source (migration 020) records the layer; this records the
-- specific model, so a drop in accuracy after a model change is attributable.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS classification_model TEXT;

COMMENT ON COLUMN documents.classification_model IS
  'Model that produced the classification, e.g. claude-haiku-4-5-20251001. Null for webhook or prefilter decisions.';
