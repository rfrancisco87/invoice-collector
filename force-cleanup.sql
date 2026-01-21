-- ============================================================================
-- FORCE CLEANUP - Remove ALL triggers and functions
-- Run this to completely clean the database
-- ============================================================================

-- 1. Drop ALL triggers on auth.users (this is critical!)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_schema = 'auth'
        AND event_object_table = 'users'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || r.trigger_name || ' ON auth.users CASCADE';
        RAISE NOTICE 'Dropped trigger: %', r.trigger_name;
    END LOOP;
END $$;

-- 2. Drop ALL functions in public schema
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT routine_name, routine_schema
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_type = 'FUNCTION'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.routine_schema || '.' || r.routine_name || ' CASCADE';
        RAISE NOTICE 'Dropped function: %.%', r.routine_schema, r.routine_name;
    END LOOP;
END $$;

-- 3. Delete all users (start completely fresh)
DELETE FROM auth.users;

-- 4. Truncate all our tables
TRUNCATE TABLE user_feedback CASCADE;
TRUNCATE TABLE sender_reputation CASCADE;
TRUNCATE TABLE sync_jobs CASCADE;
TRUNCATE TABLE documents CASCADE;
TRUNCATE TABLE user_settings CASCADE;
TRUNCATE TABLE gmail_accounts CASCADE;

-- 5. Verify - this should return NO rows
SELECT 'Remaining auth.users triggers:' as info;
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
AND event_object_table = 'users';

SELECT 'Remaining public functions:' as info;
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_type = 'FUNCTION';
