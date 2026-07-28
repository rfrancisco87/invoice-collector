-- Migration 020: Classification metadata
--
-- Classification today is a single opaque `document_type` string from the n8n
-- webhook. When it is wrong — and at roughly a 70-80% hit rate it often is —
-- there is nothing recorded to explain why, no confidence to threshold on, and
-- nothing to tune. Non-invoices get accepted as invoices, and the Drive file of
-- anything judged "not an invoice" is deleted with no record that it existed.
--
-- These columns make a classification decision inspectable and gateable:
--
--   confidence_score      already existed, but was written as a meaningless
--                         1.0 / 0.5 flag for "webhook answered / didn't". It
--                         now carries a real 0..1 confidence.
--   classification_source which layer decided (prefilter / webhook / llm / none)
--   classification_reason human-readable justification, shown in the UI
--   needs_review          the decision was not confident enough to trust; the
--                         document stays pending and is flagged for the user
--   prefilter_matched     which deterministic rules fired, for debugging

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS classification_source TEXT,
  ADD COLUMN IF NOT EXISTS classification_reason TEXT,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prefilter_matched JSONB;

COMMENT ON COLUMN documents.classification_source IS
  'Which layer produced the classification: prefilter | webhook | llm | none.';
COMMENT ON COLUMN documents.classification_reason IS
  'Human-readable explanation of the classification, surfaced in the UI so a wrong call can be understood rather than just corrected.';
COMMENT ON COLUMN documents.needs_review IS
  'Set when confidence fell below the trust threshold. The document stays pending; the UI flags it instead of silently presenting a low-confidence guess as fact.';
COMMENT ON COLUMN documents.prefilter_matched IS
  'Deterministic rules that fired during pre-filtering, e.g. {"negative":["statement"],"positive":[]}.';
COMMENT ON COLUMN documents.confidence_score IS
  'Classifier confidence, 0..1. Previously a 1.0/0.5 flag meaning "webhook responded"; now a real score.';

-- Pending documents needing attention is the query the dashboard runs most.
CREATE INDEX IF NOT EXISTS idx_documents_user_needs_review
  ON documents (user_id, needs_review)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Per-user classification tuning
-- ---------------------------------------------------------------------------

-- Below this, a classification is flagged for review rather than trusted.
-- Default 0.7: the webhook currently reports no confidence at all, so its
-- results are assigned a fixed score and this threshold only bites once a real
-- confidence signal exists (Phase 4b). Exposed per user because tolerance for
-- false positives vs manual review differs by workflow.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS classification_confidence_threshold NUMERIC(3,2)
    NOT NULL DEFAULT 0.70
    CHECK (classification_confidence_threshold >= 0 AND classification_confidence_threshold <= 1);

-- The deterministic pre-filter runs before Drive upload and before the
-- classifier, so obvious non-invoices cost nothing. Opt-out exists because a
-- filename-based heuristic can in principle skip something wanted, and the
-- user should be able to turn it off without a code change.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS prefilter_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN user_settings.classification_confidence_threshold IS
  'Classifications scoring below this are marked needs_review instead of being accepted outright.';
COMMENT ON COLUMN user_settings.prefilter_enabled IS
  'Run the deterministic filename/subject pre-filter before uploading and classifying.';
