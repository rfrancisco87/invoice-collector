-- Migration: Multi-source and Multi-attachment Support

-- 1. Update documents table to support multiple attachments per email
-- First, drop the existing constraint if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_user_id_email_message_id_key') THEN
        ALTER TABLE documents DROP CONSTRAINT documents_user_id_email_message_id_key;
    END IF;
END $$;

-- Add new constraint including file_hash to allow multiple files per email
-- Using a unique index/constraint on user_id + email_message_id + file_hash
ALTER TABLE documents
ADD CONSTRAINT documents_user_id_email_message_id_file_hash_key 
UNIQUE (user_id, email_message_id, file_hash);

-- Start Change: Make gmail_account_id nullable for other sources (forwarding, upload)
ALTER TABLE documents ALTER COLUMN gmail_account_id DROP NOT NULL;
-- End Change

-- 2. Update user_settings table for new features
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS inbound_email TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS enabled_sources TEXT[] DEFAULT '{upload}'::TEXT[],
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Add index for inbound email lookup
CREATE INDEX IF NOT EXISTS idx_user_settings_inbound_email ON user_settings(inbound_email);

-- Comment on columns
COMMENT ON COLUMN user_settings.inbound_email IS 'Unique inbound email address for forwarding (e.g., slug@entuaava.resend.app)';
COMMENT ON COLUMN user_settings.enabled_sources IS 'List of enabled ingestion sources (gmail, forwarding, upload)';
