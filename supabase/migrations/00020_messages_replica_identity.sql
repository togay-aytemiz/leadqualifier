-- Enable REPLICA IDENTITY FULL on messages table for Realtime filtering to work
-- This is required when using filters like organization_id=eq.xxx in Supabase Realtime subscriptions

ALTER TABLE public.messages REPLICA IDENTITY FULL;
