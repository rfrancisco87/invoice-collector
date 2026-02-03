-- Apply all migrations in order
-- Run this file in your Supabase SQL Editor

-- Migration 010: Add Profiles Table and User Roles
\i supabase/migrations/010_add_profiles_and_roles.sql

-- Migration 011: Admin RLS Policies
\i supabase/migrations/011_admin_rls_policies.sql

-- Migration 012: Add Archive Synced Emails
\i supabase/migrations/012_add_archive_synced_emails.sql

-- Migration 013: Supabase Cron Sync
\i supabase/migrations/013_supabase_cron_sync.sql

-- Migration 013b: Update Cron Config
\i supabase/migrations/013b_update_cron_config.sql

-- Migration 014: Add Onboarding
\i supabase/migrations/014_add_onboarding.sql
