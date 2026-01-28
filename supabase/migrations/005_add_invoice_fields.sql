-- Add invoice data fields to documents table
-- These fields store structured data extracted from PDFs via webhook

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS invoice_number TEXT,
ADD COLUMN IF NOT EXISTS issue_date DATE,
ADD COLUMN IF NOT EXISTS supplier_name TEXT,
ADD COLUMN IF NOT EXISTS supplier_vat_number TEXT,
ADD COLUMN IF NOT EXISTS total_without_vat NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS total_vat NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS invoice_total NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS currency TEXT,
ADD COLUMN IF NOT EXISTS numb_pages INTEGER,
ADD COLUMN IF NOT EXISTS document_type TEXT,
ADD COLUMN IF NOT EXISTS webhook_processed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS webhook_error TEXT;

-- Add comments for documentation
COMMENT ON COLUMN documents.invoice_number IS 'Invoice number extracted from PDF';
COMMENT ON COLUMN documents.issue_date IS 'Invoice issue date extracted from PDF';
COMMENT ON COLUMN documents.supplier_name IS 'Supplier/vendor name extracted from PDF';
COMMENT ON COLUMN documents.supplier_vat_number IS 'Supplier VAT/tax ID extracted from PDF';
COMMENT ON COLUMN documents.total_without_vat IS 'Invoice subtotal (without VAT/tax)';
COMMENT ON COLUMN documents.total_vat IS 'Total VAT/tax amount';
COMMENT ON COLUMN documents.invoice_total IS 'Total invoice amount (including VAT)';
COMMENT ON COLUMN documents.currency IS 'Currency code (EUR, USD, etc.)';
COMMENT ON COLUMN documents.numb_pages IS 'Number of pages in the PDF';
COMMENT ON COLUMN documents.document_type IS 'Document type returned by webhook (invoice, credit_note, etc.)';
COMMENT ON COLUMN documents.webhook_processed_at IS 'Timestamp when webhook successfully processed the document';
COMMENT ON COLUMN documents.webhook_error IS 'Error message if webhook processing failed';

-- Create index on invoice_number for faster searches
CREATE INDEX IF NOT EXISTS idx_documents_invoice_number ON documents(invoice_number);

-- Create index on supplier_name for faster searches
CREATE INDEX IF NOT EXISTS idx_documents_supplier_name ON documents(supplier_name);

-- Create index on issue_date for date range queries
CREATE INDEX IF NOT EXISTS idx_documents_issue_date ON documents(issue_date);

-- Create index on webhook_error to quickly find failed processing
CREATE INDEX IF NOT EXISTS idx_documents_webhook_error ON documents(webhook_error) WHERE webhook_error IS NOT NULL;
