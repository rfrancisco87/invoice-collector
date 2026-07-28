-- Migration 024: User-defined classification rules
--
-- The built-in pre-filter and prompt encode general knowledge about what an
-- invoice looks like. They cannot know that *this* user's accountant sends
-- monthly PDFs that are never invoices, or that a particular supplier's
-- statements should always be skipped. Rules are how a user teaches the
-- pipeline about their own mail without a code change.
--
-- Rules attach to one of the three pipeline layers:
--
--   pre_filter     runs before Drive upload and before any classifier call.
--                  Deterministic and free — the right place for "never process
--                  anything from this domain".
--   prompt_hint    injected into the classifier prompt as a natural-language
--                  instruction. For judgements a pattern cannot express.
--   post_decision  applied to the classifier's answer. Overrides or forces
--                  review.

DO $$ BEGIN
  CREATE TYPE classification_rule_stage AS ENUM ('pre_filter', 'prompt_hint', 'post_decision');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE classification_rule_match AS ENUM (
    'sender_domain',   -- exact domain match
    'sender_email',    -- exact address match
    'filename_regex',  -- user-supplied pattern, length- and time-guarded
    'subject_keyword', -- case-insensitive substring
    'nl_instruction'   -- free text, only meaningful for prompt_hint
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE classification_rule_action AS ENUM (
    'skip',              -- discard without storing
    'force_invoice',     -- classify as invoice regardless
    'force_not_invoice', -- classify as other regardless
    'require_review',    -- keep, but always flag for the user
    'hint'               -- prompt_hint only: advice, not a verdict
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS classification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- Lower runs first. Ties break on created_at so ordering is always total and
  -- a rule list cannot reorder itself between requests.
  priority INTEGER NOT NULL DEFAULT 100,
  stage classification_rule_stage NOT NULL,
  match_type classification_rule_match NOT NULL,
  -- The domain, address, pattern, keyword or instruction text.
  match_value TEXT NOT NULL,
  action classification_rule_action NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Bounded so a pathological pattern cannot be stored in the first place;
  -- lib/classifier/rules.ts additionally guards evaluation time.
  CONSTRAINT classification_rules_value_length CHECK (char_length(match_value) BETWEEN 1 AND 500),
  CONSTRAINT classification_rules_name_length CHECK (char_length(name) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS classification_rules_user_idx
  ON classification_rules (user_id, enabled, priority);

COMMENT ON TABLE classification_rules IS
  'Per-user rules layered onto the built-in classification pipeline.';
COMMENT ON COLUMN classification_rules.priority IS
  'Lower runs first. Ties break on created_at.';
COMMENT ON COLUMN classification_rules.match_value IS
  'Interpretation depends on match_type. For filename_regex this is user input and is evaluated under a length cap and time guard.';

ALTER TABLE classification_rules ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_classification_rules_updated_at ON classification_rules;
CREATE TRIGGER update_classification_rules_updated_at
  BEFORE UPDATE ON classification_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Which rules fired for a document, for explaining an outcome after the fact.
-- documents.prefilter_matched (migration 020) covers the built-in rules; this
-- covers the user's own.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS rules_applied JSONB;

COMMENT ON COLUMN documents.rules_applied IS
  'User-defined rules that fired for this document, as [{id, name, action}]. Null when none applied.';
