-- Enable Row-Level Security on app_credentials table
-- This table stores password hashes and should only be accessible via service_role
ALTER TABLE public.app_credentials ENABLE ROW LEVEL SECURITY;

-- Add approved folder configuration columns to user_settings
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS approved_folder_name TEXT,
ADD COLUMN IF NOT EXISTS approved_folder_mode TEXT DEFAULT 'managed' CHECK (approved_folder_mode IN ('managed', 'existing'));
