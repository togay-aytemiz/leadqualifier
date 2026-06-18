create table if not exists public.organization_ai_dictionary_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  term text not null,
  normalized_term text not null,
  meanings text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_ai_dictionary_entries_term_present
    check (btrim(term) <> ''),
  constraint organization_ai_dictionary_entries_normalized_term_present
    check (btrim(normalized_term) <> ''),
  constraint organization_ai_dictionary_entries_meanings_present
    check (array_length(meanings, 1) is not null and array_length(meanings, 1) > 0)
);

create unique index if not exists organization_ai_dictionary_entries_org_term_idx
  on public.organization_ai_dictionary_entries (organization_id, normalized_term);

create index if not exists organization_ai_dictionary_entries_org_enabled_idx
  on public.organization_ai_dictionary_entries (organization_id, enabled, term);

drop trigger if exists update_organization_ai_dictionary_entries_updated_at
  on public.organization_ai_dictionary_entries;
create trigger update_organization_ai_dictionary_entries_updated_at
  before update on public.organization_ai_dictionary_entries
  for each row execute function update_updated_at_column();

alter table public.organization_ai_dictionary_entries enable row level security;

drop policy if exists "Users can view org AI dictionary entries"
  on public.organization_ai_dictionary_entries;
create policy "Users can view org AI dictionary entries"
  on public.organization_ai_dictionary_entries for select
  using (
    organization_id in (select get_user_organizations(auth.uid()))
    or is_system_admin_secure()
  );

drop policy if exists "Org admins can manage AI dictionary entries"
  on public.organization_ai_dictionary_entries;
create policy "Org admins can manage AI dictionary entries"
  on public.organization_ai_dictionary_entries for all
  using (
    is_org_admin(organization_id, auth.uid())
    or is_system_admin_secure()
  )
  with check (
    is_org_admin(organization_id, auth.uid())
    or is_system_admin_secure()
  );
