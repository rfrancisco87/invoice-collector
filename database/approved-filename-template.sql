alter table public.user_settings
add column if not exists approved_filename_template text;

comment on column public.user_settings.approved_filename_template is
  'Filename template applied when a document is approved. Supports {supplier_name}, {vat_number}, {month}, {year}, {invoice_number}, {invoice_total}, {currency}. NULL means use the built-in default.';
