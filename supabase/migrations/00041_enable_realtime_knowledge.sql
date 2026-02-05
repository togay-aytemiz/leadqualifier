-- Enable realtime for Knowledge Base tables

ALTER PUBLICATION supabase_realtime ADD TABLE public.knowledge_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.knowledge_collections;
