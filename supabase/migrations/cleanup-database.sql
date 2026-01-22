-- ============================================================================
-- DATABASE CLEANUP SCRIPT
-- This removes all old triggers, functions, and objects that might interfere
-- ============================================================================

-- Step 1: Drop all triggers on auth.users (these can interfere with OAuth)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Step 2: Drop any old functions that might be causing issues
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Step 3: Check for and drop any other triggers on our tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers
        WHERE event_object_schema = 'public'
        AND event_object_table IN ('gmail_accounts', 'user_settings', 'documents', 'sync_jobs', 'user_feedback', 'sender_reputation')
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || r.trigger_name || ' ON ' || r.event_object_table || ' CASCADE';
    END LOOP;
END $$;

-- Step 4: Delete all existing data (fresh start)
TRUNCATE TABLE user_feedback CASCADE;
TRUNCATE TABLE sender_reputation CASCADE;
TRUNCATE TABLE sync_jobs CASCADE;
TRUNCATE TABLE documents CASCADE;
TRUNCATE TABLE user_settings CASCADE;
TRUNCATE TABLE gmail_accounts CASCADE;

-- Step 5: Clean up any existing users in auth.users (CAREFUL: This deletes all users!)
-- Uncomment the next line ONLY if you want to delete all test users
-- DELETE FROM auth.users;

-- Step 6: Verify cleanup - show remaining triggers
SELECT
    trigger_name,
    event_object_schema,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema IN ('auth', 'public')
ORDER BY event_object_table, trigger_name;
