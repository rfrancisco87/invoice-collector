-- Auto-decision (learning) feature
--
-- Adds columns that let the ingestion pipeline act on a document automatically
-- based on prior user feedback (same file hash, sender reputation) instead of
-- always leaving it as 'pending'.
--
-- Design notes:
--   * We reuse status='rejected' / status='approved' instead of introducing new
--     statuses — the documents list query already filters by pending and this
--     keeps existing approved/rejected surfaces working unchanged.
--   * auto_action_reason is the audit trail. When NULL, the status change came
--     from a real user action; when set, it was an automatic decision that the
--     user can undo.
--   * The existing update_sender_reputation() trigger fires on user_feedback
--     insert — auto-decisions deliberately skip user_feedback so they don't
--     snowball the counters and lock a sender in forever after one rejection.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS auto_action_reason TEXT;

COMMENT ON COLUMN documents.auto_action_reason IS
  'When set, the status was chosen automatically by the learning pipeline. Describes which rule fired (e.g. "file_hash_rejected", "sender_blocked"). NULL for user-initiated actions.';

-- User-level toggles for the auto-decision pipeline.
--   auto_reject_enabled defaults to true — it only triggers on strong signals
--     (exact file hash or blocked sender) so it is safe to opt users in.
--   auto_approve_enabled defaults to false — auto-approving moves files into
--     the user's Approved/MM-YYYY folder and records them as finished, which is
--     harder to undo and should be explicitly opted into.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS auto_reject_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS auto_approve_enabled BOOLEAN NOT NULL DEFAULT false;

-- Index to make the "has this file_hash been rejected before?" lookup cheap.
-- Partial index keeps it small — we only care about rejected rows.
CREATE INDEX IF NOT EXISTS idx_documents_user_hash_rejected
  ON documents (user_id, file_hash)
  WHERE status = 'rejected';
