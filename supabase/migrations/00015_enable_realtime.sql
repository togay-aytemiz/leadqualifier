-- Enable Realtime for Inbox tables
-- This allows the 'postgres_changes' listener in the frontend to receive events
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
