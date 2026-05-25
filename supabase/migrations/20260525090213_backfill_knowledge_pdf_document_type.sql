-- Backfill website-crawled PDF pages that were imported before the crawl
-- importer distinguished PDF documents from normal article pages.
UPDATE public.knowledge_documents
SET
    type = 'pdf',
    updated_at = NOW()
WHERE type <> 'pdf'
  AND source = 'website_crawl'
  AND content ~* '(^|\n)Source URL:\s*https?://[^\n\r]+\.pdf(?:[?#][^\n\r]*)?(\n|$)';

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_org_type_status
    ON public.knowledge_documents (organization_id, type, status);
