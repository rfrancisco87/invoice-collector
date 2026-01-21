-- Invoice Collector Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- DROP EXISTING TABLES IF THEY EXIST (Fresh start)
-- ============================================================================
DROP TABLE IF EXISTS user_feedback CASCADE;
DROP TABLE IF EXISTS sender_reputation CASCADE;
DROP TABLE IF EXISTS sync_jobs CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS gmail_accounts CASCADE;

-- Drop existing types
DROP TYPE IF EXISTS feedback_action CASCADE;
DROP TYPE IF EXISTS sync_status CASCADE;
DROP TYPE IF EXISTS document_status CASCADE;
DROP TYPE IF EXISTS document_classification CASCADE;

-- ============================================================================
-- CREATE ENUMS FIRST
-- ============================================================================

-- Create ENUMs before tables
CREATE TYPE document_classification AS ENUM ('invoice', 'credit_note', 'unclassified');
CREATE TYPE document_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE sync_status AS ENUM ('running', 'completed', 'failed');
CREATE TYPE feedback_action AS ENUM ('approved', 'rejected', 'reclassified');

-- ============================================================================
-- TABLES
-- ============================================================================

-- Gmail Accounts Table
CREATE TABLE gmail_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id) -- MVP: Only one account per user
);

-- User Settings Table
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  drive_folder_id TEXT,
  drive_folder_name TEXT,
  drive_folder_path TEXT,
  sync_days_back INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents Table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  email_message_id TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  subject TEXT,
  sender TEXT,
  sender_domain TEXT,
  received_date TIMESTAMPTZ NOT NULL,
  filename TEXT NOT NULL,
  original_classification document_classification NOT NULL,
  final_classification document_classification NOT NULL,
  confidence_score DECIMAL(5,4),
  was_reclassified BOOLEAN DEFAULT false,
  status document_status DEFAULT 'pending',
  drive_file_id TEXT,
  drive_folder_path TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  UNIQUE(user_id, email_message_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_documents_user_status ON documents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_sender_domain ON documents(sender_domain);
CREATE INDEX IF NOT EXISTS idx_documents_received_date ON documents(received_date DESC);

-- Sync Jobs Table
CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID NOT NULL REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  status sync_status DEFAULT 'running',
  sync_from_date TIMESTAMPTZ NOT NULL,
  sync_to_date TIMESTAMPTZ NOT NULL,
  emails_scanned INTEGER DEFAULT 0,
  documents_found INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

-- User Feedback Table (Learning)
CREATE TABLE user_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  action feedback_action NOT NULL,
  original_classification document_classification,
  new_classification document_classification,
  sender_domain TEXT,
  feedback_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sender Reputation Table
CREATE TABLE sender_reputation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_domain TEXT NOT NULL,
  approval_count INTEGER DEFAULT 0,
  rejection_count INTEGER DEFAULT 0,
  reputation_score DECIMAL(10,2) DEFAULT 0,
  is_trusted BOOLEAN DEFAULT false,
  is_blocked BOOLEAN DEFAULT false,
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, sender_domain)
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE sender_reputation ENABLE ROW LEVEL SECURITY;

-- Gmail Accounts Policies
DROP POLICY IF EXISTS "Users can manage own Gmail account" ON gmail_accounts;
CREATE POLICY "Users can manage own Gmail account"
  ON gmail_accounts FOR ALL
  USING (auth.uid() = user_id);

-- User Settings Policies
DROP POLICY IF EXISTS "Users can manage own settings" ON user_settings;
CREATE POLICY "Users can manage own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id);

-- Documents Policies
DROP POLICY IF EXISTS "Users can view own documents" ON documents;
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own documents" ON documents;
CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own documents" ON documents;
CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON documents;
CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- Sync Jobs Policies
DROP POLICY IF EXISTS "Users can view own sync jobs" ON sync_jobs;
CREATE POLICY "Users can view own sync jobs"
  ON sync_jobs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sync jobs" ON sync_jobs;
CREATE POLICY "Users can insert own sync jobs"
  ON sync_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sync jobs" ON sync_jobs;
CREATE POLICY "Users can update own sync jobs"
  ON sync_jobs FOR UPDATE
  USING (auth.uid() = user_id);

-- User Feedback Policies
DROP POLICY IF EXISTS "Users can manage own feedback" ON user_feedback;
CREATE POLICY "Users can manage own feedback"
  ON user_feedback FOR ALL
  USING (auth.uid() = user_id);

-- Sender Reputation Policies
DROP POLICY IF EXISTS "Users can manage own reputation data" ON sender_reputation;
CREATE POLICY "Users can manage own reputation data"
  ON sender_reputation FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================================
-- DATABASE FUNCTIONS
-- ============================================================================

-- Function to automatically update sender reputation
CREATE OR REPLACE FUNCTION update_sender_reputation()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update sender reputation
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
      CASE WHEN NEW.action = 'rejected' THEN 1 ELSE 0 END) >= 2,
    last_interaction = NOW(),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update reputation on feedback
DROP TRIGGER IF EXISTS trigger_update_sender_reputation ON user_feedback;
CREATE TRIGGER trigger_update_sender_reputation
  AFTER INSERT ON user_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_sender_reputation();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_settings
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for sender_reputation (on manual updates)
DROP TRIGGER IF EXISTS update_sender_reputation_updated_at ON sender_reputation;
CREATE TRIGGER update_sender_reputation_updated_at
  BEFORE UPDATE ON sender_reputation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DONE!
-- ============================================================================

-- Verify tables were created
SELECT
  'gmail_accounts' as table_name,
  (SELECT COUNT(*) FROM gmail_accounts) as row_count
UNION ALL
SELECT 'user_settings', (SELECT COUNT(*) FROM user_settings)
UNION ALL
SELECT 'documents', (SELECT COUNT(*) FROM documents)
UNION ALL
SELECT 'sync_jobs', (SELECT COUNT(*) FROM sync_jobs)
UNION ALL
SELECT 'user_feedback', (SELECT COUNT(*) FROM user_feedback)
UNION ALL
SELECT 'sender_reputation', (SELECT COUNT(*) FROM sender_reputation);
