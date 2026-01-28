-- Add notification settings to user_settings table
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_email TEXT,
ADD COLUMN IF NOT EXISTS last_auto_sync_at TIMESTAMP WITH TIME ZONE;

-- Add comment to explain columns
COMMENT ON COLUMN user_settings.auto_sync_enabled IS 'Enable automatic email syncing via cron job';
COMMENT ON COLUMN user_settings.email_notifications_enabled IS 'Send email notifications when new documents are found';
COMMENT ON COLUMN user_settings.notification_email IS 'Email address for notifications (defaults to user email)';
COMMENT ON COLUMN user_settings.last_auto_sync_at IS 'Timestamp of last successful auto-sync';
