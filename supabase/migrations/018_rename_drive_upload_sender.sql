-- Backfill: rename legacy "Drive Upload" sender label to "Inbox folder".
--
-- The inbox-folder ingestion path historically labelled the synthetic sender as
-- "Drive Upload", which made pending documents appear as if they'd been
-- manually uploaded via an invoice portal. The source is actually the user's
-- linked Google Drive inbox folder.
UPDATE documents
SET sender = 'Inbox folder'
WHERE sender = 'Drive Upload';
