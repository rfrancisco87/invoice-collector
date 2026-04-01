create table if not exists public.app_credentials (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_credentials_profile_id_idx
  on public.app_credentials (profile_id);
