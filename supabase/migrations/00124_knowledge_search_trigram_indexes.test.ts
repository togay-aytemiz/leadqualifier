import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('supabase/migrations/00124_knowledge_search_trigram_indexes.sql', 'utf8')

describe('00124 knowledge search trigram indexes migration', () => {
    it('enables trigram search support for lexical RAG fallbacks', () => {
        expect(source).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm')
        expect(source).toContain('knowledge_chunks_content_trgm_idx')
        expect(source).toContain('content gin_trgm_ops')
        expect(source).toContain('knowledge_documents_title_trgm_idx')
        expect(source).toContain('title gin_trgm_ops')
    })

    it('adds scoped join indexes used by hybrid retrieval filters', () => {
        expect(source).toContain('knowledge_chunks_org_document_idx')
        expect(source).toContain('(organization_id, document_id)')
        expect(source).toContain('knowledge_documents_ready_org_id_idx')
        expect(source).toContain("WHERE status = 'ready'")
    })
})
