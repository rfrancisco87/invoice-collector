-- Approved documents can be delivered by email (e.g. to the TOCOnline
-- document-reception address) in addition to being moved into the Drive
-- Approved folder.
alter table public.user_settings
add column if not exists approved_delivery_mode text not null default 'drive'
check (approved_delivery_mode in ('drive', 'email'));

alter table public.user_settings
add column if not exists approved_delivery_email text;

comment on column public.user_settings.approved_delivery_mode is
  'How approved documents are delivered: ''drive'' moves them to the Approved folder; ''email'' also sends them as an attachment to approved_delivery_email (they are still filed in the Approved folder).';
comment on column public.user_settings.approved_delivery_email is
  'Destination address for approved documents when approved_delivery_mode = ''email'' (e.g. the TOCOnline document-reception email).';

alter table public.documents
add column if not exists emailed_to text;

alter table public.documents
add column if not exists emailed_at timestamptz;

comment on column public.documents.emailed_to is
  'Address the approved document was emailed to (approved_delivery_mode = ''email''). NULL if it was only filed in Drive.';
