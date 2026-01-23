-- Add Gmail label configuration to user_settings
-- This allows users to customize the label applied to synced emails

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS gmail_sync_label TEXT DEFAULT 'Invoice Collector - Synced';

-- Add option to archive synced emails
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS archive_synced_emails BOOLEAN DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN user_settings.gmail_sync_label IS 'Gmail label to apply to emails after they have been synced. Default: "Invoice Collector - Synced"';
COMMENT ON COLUMN user_settings.archive_synced_emails IS 'If true, emails will be archived (removed from inbox) after syncing. Default: false';
