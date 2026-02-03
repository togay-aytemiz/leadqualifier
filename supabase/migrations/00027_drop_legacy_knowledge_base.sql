-- Drop legacy knowledge_base table and related RPC

DROP FUNCTION IF EXISTS match_knowledge_base(vector(1536), uuid, double precision, integer);
DROP TABLE IF EXISTS public.knowledge_base CASCADE;
