import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = path.resolve(process.cwd(), 'supabase/migrations/20260525090213_backfill_knowledge_pdf_document_type.sql')

describe('knowledge PDF document type backfill migration source', () => {
    it('marks website-crawled PDF source documents as pdf and indexes org/type/status lookups', () => {
        const source = fs.readFileSync(MIGRATION_PATH, 'utf8')

        expect(source).toContain('UPDATE public.knowledge_documents')
        expect(source).toContain("type = 'pdf'")
        expect(source).toContain("source = 'website_crawl'")
        expect(source).toContain("content ~* '(^|\\n)Source URL:")
        expect(source).toContain('idx_knowledge_documents_org_type_status')
    })
})
