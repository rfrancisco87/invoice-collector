-- Fix existing document classifications based on webhook document_type
-- This updates records that were processed before the classification logic was fixed

-- Update supplier_invoice -> invoice
UPDATE documents
SET
  original_classification = 'invoice',
  final_classification = 'invoice',
  confidence_score = 1.0
WHERE
  document_type = 'supplier_invoice'
  AND final_classification = 'unclassified';

-- Update credit_note (if any exist)
UPDATE documents
SET
  original_classification = 'credit_note',
  final_classification = 'credit_note',
  confidence_score = 1.0
WHERE
  document_type = 'credit_note'
  AND final_classification = 'unclassified';

-- Add comment for documentation
COMMENT ON COLUMN documents.document_type IS 'Document type returned by webhook: supplier_invoice maps to invoice classification, credit_note maps to credit_note classification';
