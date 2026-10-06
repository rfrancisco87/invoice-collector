-- A sender the user approves must never be auto-blocked.
--
-- update_sender_reputation() set is_blocked once rejection_count reached 2,
-- regardless of approvals. Senders that attach two PDFs per email (invoice +
-- duplicate/receipt) collect a rejection every time the user keeps one copy
-- and rejects the other, so a sender with 12 approvals ended up both trusted
-- and blocked — and the auto-decision pipeline checks blocked first, so every
-- new invoice from it was silently auto-rejected and no notification was sent.
--
-- Blocking now requires that the user has never approved anything from the
-- sender. Existing rows are recomputed so currently-blocked senders with
-- approvals are unblocked immediately.

CREATE OR REPLACE FUNCTION update_sender_reputation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO sender_reputation (
    user_id,
    sender_domain,
    approval_count,
    rejection_count,
    reputation_score,
    is_trusted,
    is_blocked,
    last_interaction,
    updated_at
  )
  VALUES (
    NEW.user_id,
    NEW.sender_domain,
    CASE WHEN NEW.action = 'approved' THEN 1 ELSE 0 END,
    CASE WHEN NEW.action = 'rejected' THEN 1 ELSE 0 END,
    CASE WHEN NEW.action = 'approved' THEN 1 ELSE -1 END,
    false,
    false,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, sender_domain)
  DO UPDATE SET
    approval_count = sender_reputation.approval_count +
      CASE WHEN NEW.action = 'approved' THEN 1 ELSE 0 END,
    rejection_count = sender_reputation.rejection_count +
      CASE WHEN NEW.action = 'rejected' THEN 1 ELSE 0 END,
    reputation_score = (sender_reputation.approval_count +
      CASE WHEN NEW.action = 'approved' THEN 1 ELSE 0 END) -
      (sender_reputation.rejection_count +
      CASE WHEN NEW.action = 'rejected' THEN 1 ELSE 0 END),
    is_trusted = (sender_reputation.approval_count +
      CASE WHEN NEW.action = 'approved' THEN 1 ELSE 0 END) >= 3,
    is_blocked = (sender_reputation.rejection_count +
      CASE WHEN NEW.action = 'rejected' THEN 1 ELSE 0 END) >= 2
      AND (sender_reputation.approval_count +
      CASE WHEN NEW.action = 'approved' THEN 1 ELSE 0 END) = 0,
    last_interaction = NOW(),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

UPDATE sender_reputation
SET is_blocked = (rejection_count >= 2 AND approval_count = 0)
WHERE is_blocked IS DISTINCT FROM (rejection_count >= 2 AND approval_count = 0);
