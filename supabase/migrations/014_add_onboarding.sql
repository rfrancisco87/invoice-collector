-- Migration 014: Add Onboarding Support
-- Adds fields to track user onboarding progress and demo invoices

-- Add onboarding fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS demo_invoice_created BOOLEAN DEFAULT false;

-- Add is_demo field to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- Update the handle_new_user function to initialize onboarding fields
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, onboarding_completed, onboarding_step, demo_invoice_created)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    false,
    0,
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments
COMMENT ON COLUMN profiles.onboarding_completed IS 'Whether user has completed the onboarding wizard';
COMMENT ON COLUMN profiles.onboarding_step IS 'Current step in onboarding wizard (0-4)';
COMMENT ON COLUMN profiles.demo_invoice_created IS 'Whether demo invoice has been created for this user';
COMMENT ON COLUMN documents.is_demo IS 'Whether this is a demo invoice for onboarding';

-- Create index for demo invoices
CREATE INDEX IF NOT EXISTS idx_documents_is_demo ON documents(user_id, is_demo) WHERE is_demo = true;
