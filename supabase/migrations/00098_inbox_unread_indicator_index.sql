create index if not exists conversations_unread_indicator_org_idx
on public.conversations (organization_id)
where unread_count > 0;
