create table if not exists public.inbound_message_jobs (
    id uuid primary key default gen_random_uuid(),
    source text not null check (source in ('whatsapp', 'instagram', 'demo_chat', 'web_chat')),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    channel_id uuid references public.channels(id) on delete set null,
    provider_message_id text not null,
    status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
    attempts integer not null default 0 check (attempts >= 0),
    max_attempts integer not null default 3 check (max_attempts > 0),
    payload jsonb not null default '{}'::jsonb,
    last_error text,
    locked_at timestamptz,
    locked_until timestamptz,
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (source, provider_message_id)
);

alter table public.inbound_message_jobs enable row level security;

create index if not exists inbound_message_jobs_pending_idx
on public.inbound_message_jobs (status, created_at)
where status in ('pending', 'processing');

create index if not exists inbound_message_jobs_locked_until_idx
on public.inbound_message_jobs (locked_until)
where status = 'processing';

create index if not exists inbound_message_jobs_org_created_idx
on public.inbound_message_jobs (organization_id, created_at desc);
