-- Ensure DELETE events include old row data for realtime filters

ALTER TABLE public.knowledge_documents REPLICA IDENTITY FULL;
ALTER TABLE public.knowledge_collections REPLICA IDENTITY FULL;
