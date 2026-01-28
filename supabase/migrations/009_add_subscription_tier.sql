-- Add subscription tier for sync frequency control
-- Free users: 2 syncs per day (720 minutes = 12 hours)
-- Paid users: sync every 15 minutes

-- Create enum type for subscription tiers
DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM ('free', 'paid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add subscription tier column
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'paid'));

-- Add sync frequency in minutes (calculated based on tier)
-- Free: 720 minutes (12 hours, 2x per day)
-- Paid: 15 minutes
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS sync_frequency_minutes INTEGER DEFAULT 720;

-- Add comments for documentation
COMMENT ON COLUMN user_settings.subscription_tier IS 'User subscription tier: free (2 syncs/day) or paid (every 15 min)';
COMMENT ON COLUMN user_settings.sync_frequency_minutes IS 'Sync frequency in minutes. Free: 720 (12h), Paid: 15';

-- Create function to automatically set sync frequency based on tier
CREATE OR REPLACE FUNCTION set_sync_frequency_from_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subscription_tier = 'paid' THEN
    NEW.sync_frequency_minutes := 15;
  ELSE
    NEW.sync_frequency_minutes := 720;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update sync frequency when tier changes
DROP TRIGGER IF EXISTS update_sync_frequency ON user_settings;
CREATE TRIGGER update_sync_frequency
  BEFORE INSERT OR UPDATE OF subscription_tier ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_sync_frequency_from_tier();
