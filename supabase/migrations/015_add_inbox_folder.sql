-- Migration: Add Inbox Folder Sync Feature
-- Description: Add support for syncing documents from a Google Drive inbox folder
-- Date: 2026-02-02

-- Add inbox folder configuration to user_settings
ALTER TABLE user_settings 
ADD COLUMN inbox_folder_id TEXT,
ADD COLUMN inbox_folder_name TEXT,
ADD COLUMN inbox_folder_enabled BOOLEAN DEFAULT false,
ADD COLUMN last_inbox_sync_at TIMESTAMPTZ,
ADD COLUMN pending_folder_id TEXT,
ADD COLUMN approved_folder_id TEXT;

-- Add source tracking to documents
ALTER TABLE documents 
ADD COLUMN source TEXT DEFAULT 'gmail' CHECK (source IN ('gmail', 'inbox_folder')),
ADD COLUMN inbox_file_id TEXT; -- Track original inbox file for cleanup

-- Create index for faster source filtering
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(user_id, source, status);

-- Add comments for documentation
COMMENT ON COLUMN documents.source IS 'Source of the document: gmail (from email) or inbox_folder (from Drive folder)';
COMMENT ON COLUMN documents.inbox_file_id IS 'Original Drive file ID from inbox folder (for cleanup after approval/rejection)';
