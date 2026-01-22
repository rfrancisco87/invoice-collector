-- Add webhook_url column to user_settings table
-- This allows admins to configure the n8n webhook endpoint for invoice processing

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS webhook_url TEXT DEFAULT 'https://n8n.rfrancisco.io/webhook/invoice-processor';

-- Add comment for documentation
COMMENT ON COLUMN user_settings.webhook_url IS 'External webhook URL for automated invoice data extraction (n8n integration)';
