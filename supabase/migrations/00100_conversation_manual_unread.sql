alter table public.conversations
add column if not exists manual_unread boolean not null default false;
