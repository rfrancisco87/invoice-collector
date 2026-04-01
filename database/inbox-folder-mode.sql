alter table public.user_settings
add column if not exists inbox_folder_mode text
check (inbox_folder_mode in ('managed', 'existing'));

update public.user_settings
set inbox_folder_mode = case
  when inbox_folder_enabled = true and inbox_folder_name is not null and inbox_folder_name <> 'Inbox' then 'existing'
  else 'managed'
end
where inbox_folder_mode is null;
