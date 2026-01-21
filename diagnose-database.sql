-- ============================================================================
-- DATABASE DIAGNOSTIC SCRIPT
-- Run this first to see what exists in your database
-- ============================================================================

-- 1. Check all triggers
SELECT
    'TRIGGER' as object_type,
    trigger_name as name,
    event_object_schema as schema,
    event_object_table as table_name,
    action_statement as details
FROM information_schema.triggers
WHERE event_object_schema IN ('auth', 'public')
ORDER BY event_object_table, trigger_name;

-- 2. Check all functions
SELECT
    'FUNCTION' as object_type,
    routine_name as name,
    routine_schema as schema,
    routine_type as type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- 3. Check all tables in public schema
SELECT
    'TABLE' as object_type,
    table_name as name,
    'public' as schema
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 4. Check for policies (RLS)
SELECT
    'POLICY' as object_type,
    schemaname as schema,
    tablename as table_name,
    policyname as name,
    roles,
    cmd as command
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5. Check existing users in auth.users
SELECT
    'USER' as object_type,
    id,
    email,
    created_at,
    last_sign_in_at
FROM auth.users
ORDER BY created_at DESC;

-- 6. Check our custom tables row counts
SELECT 'gmail_accounts' as table_name, COUNT(*) as row_count FROM gmail_accounts
UNION ALL
SELECT 'user_settings', COUNT(*) FROM user_settings
UNION ALL
SELECT 'documents', COUNT(*) FROM documents
UNION ALL
SELECT 'sync_jobs', COUNT(*) FROM sync_jobs
UNION ALL
SELECT 'user_feedback', COUNT(*) FROM user_feedback
UNION ALL
SELECT 'sender_reputation', COUNT(*) FROM sender_reputation;
