-- Mark documents with null document_type as needing reprocessing
-- This applies to documents that were processed before the webhook parsing fix
-- We'll add a webhook_error so they can be identified for manual reprocessing

UPDATE documents
SET
  webhook_error = 'Webhook response parsing failed - needs reprocessing'
WHERE
  document_type IS NULL
  AND webhook_processed_at IS NULL
  AND status = 'pending'
  AND final_classification = 'unclassified';

-- Add comment for documentation
COMMENT ON COLUMN documents.webhook_error IS 'Error message if webhook processing failed. Documents with this field populated may need reprocessing.';
