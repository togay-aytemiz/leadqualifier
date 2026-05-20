create table if not exists public.demo_chat_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null unique,
  display_name text not null,
  logo_url text,
  enabled boolean not null default true,
  shared_secret_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_chat_channels_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$')
);

create index if not exists idx_demo_chat_channels_organization_id
  on public.demo_chat_channels(organization_id);

alter table public.demo_chat_channels enable row level security;

drop policy if exists "Service role can manage demo chat channels" on public.demo_chat_channels;

create policy "Service role can manage demo chat channels"
on public.demo_chat_channels
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table public.conversations
  drop constraint if exists conversations_platform_check;

alter table public.conversations
  add constraint conversations_platform_check
  check (platform in ('whatsapp', 'telegram', 'instagram', 'simulator', 'demo_chat'));
