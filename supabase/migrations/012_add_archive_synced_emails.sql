-- Migration 012: Add archive_synced_emails column to user_settings
-- This column controls whether synced emails should be archived (removed from inbox)

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS archive_synced_emails BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN user_settings.archive_synced_emails IS 'Whether to archive (remove from inbox) emails after syncing';
