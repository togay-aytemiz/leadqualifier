-- Enable REPLICA IDENTITY FULL on messages and leads tables for Realtime filtering to work
-- This is required when using filters like organization_id=eq.xxx in Supabase Realtime subscriptions

-- Messages table
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- Leads table
ALTER TABLE public.leads REPLICA IDENTITY FULL;
