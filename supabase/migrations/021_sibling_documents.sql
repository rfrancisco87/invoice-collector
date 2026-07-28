-- Migration 021: Sibling documents (invoice + receipt pairs)
--
-- Senders like Stripe attach both an invoice and a receipt to the same email.
-- They describe one transaction, and Portuguese bookkeeping generally needs only
-- one of them — but the pipeline treated them as two unrelated files. Worse,
-- before migration 020 the receipt was usually deleted outright, because
-- anything the classifier did not call `supplier_invoice` had its Drive file
-- removed and no row written.
--
-- Grouping key: no new column. Documents already carry (user_id,
-- email_message_id), which is exactly "the attachments of one email" — the
-- unique constraint on (user_id, email_message_id, file_hash) is built on it.
-- Drive-inbox files use a per-file synthetic id, so each is its own group,
-- which is correct: unrelated uploads must never be paired.

-- ---------------------------------------------------------------------------
-- 1. Document variant
-- ---------------------------------------------------------------------------

-- final_classification collapses everything that is not an invoice or credit
-- note into 'unclassified', which loses the invoice-vs-receipt distinction that
-- pairing depends on.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS variant TEXT;

COMMENT ON COLUMN documents.variant IS
  'Finer-grained document kind from the classifier: invoice | receipt | credit_note | other. Distinct from final_classification, which collapses receipts into unclassified.';

-- ---------------------------------------------------------------------------
-- 2. Pair state
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE document_pair_state AS ENUM (
    'unpaired',           -- no sibling detected; the normal case
    'awaiting_choice',    -- a pair was found and the user must pick
    'kept',               -- chosen (or auto-chosen) side of a pair
    'discarded_duplicate' -- the other side, dropped as a duplicate of `kept`
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS pair_state document_pair_state NOT NULL DEFAULT 'unpaired',
  ADD COLUMN IF NOT EXISTS paired_with_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pair_reason TEXT;

COMMENT ON COLUMN documents.pair_state IS
  'Lifecycle of this document within an invoice/receipt pair.';
COMMENT ON COLUMN documents.paired_with_id IS
  'The sibling document describing the same transaction.';
COMMENT ON COLUMN documents.pair_reason IS
  'Why these two were considered the same transaction (matching total, shared filename stem, ...). Shown in the UI so an incorrect pairing is explicable.';

-- The pending list groups by email; this makes that grouping cheap.
CREATE INDEX IF NOT EXISTS idx_documents_user_message
  ON documents (user_id, email_message_id);

-- ---------------------------------------------------------------------------
-- 3. Per-user preference
-- ---------------------------------------------------------------------------

-- Defaults to 'invoice': in Portugal the invoice is the document that matters
-- for accounting, and defaulting to a real choice means the common case needs
-- no interaction at all. 'ask' is available for users who want to decide each
-- time.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS duplicate_pair_default TEXT
    NOT NULL DEFAULT 'invoice'
    CHECK (duplicate_pair_default IN ('ask', 'invoice', 'receipt', 'both'));

COMMENT ON COLUMN user_settings.duplicate_pair_default IS
  'What to keep when one email contains both an invoice and a receipt for the same transaction: ask | invoice | receipt | both.';
