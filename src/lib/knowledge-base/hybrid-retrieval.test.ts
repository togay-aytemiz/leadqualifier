import { describe, expect, it } from 'vitest'

import { mergeHybridRagResults } from '@/lib/knowledge-base/hybrid-retrieval'

type TestChunk = {
    chunk_id?: string | null
    document_id: string
    document_title: string
    document_type: string
    content: string
    similarity: number
    source_url?: string | null
}

describe('mergeHybridRagResults', () => {
    it('promotes chunks repeated across vector and focused-evidence channels with reciprocal rank fusion', () => {
        const broadVectorMatch: TestChunk = {
            chunk_id: 'chunk-broad',
            document_id: 'doc-broad',
            document_title: 'Genel Öğrenci Duyuruları',
            document_type: 'article',
            content: 'Genel öğrenci duyuruları ve akademik süreçler.',
            similarity: 0.99
        }
        const exactVectorMatch: TestChunk = {
            chunk_id: 'chunk-tlt',
            document_id: 'doc-tlt',
            document_title: 'Tıbbi Laboratuvar Teknikleri Staj Rehberi',
            document_type: 'pdf',
            content: 'TLT 216 Yaz Stajı 20 iş günü süresince yapılır.',
            similarity: 0.74,
            source_url: 'https://example.edu.tr/tlt-staj.pdf'
        }
        const exactFocusedMatch: TestChunk = {
            ...exactVectorMatch,
            similarity: 0.88
        }

        const results = mergeHybridRagResults({
            query: 'TLT yaz stajı kaç gün?',
            limit: 2,
            channels: [
                {
                    name: 'vector',
                    results: [broadVectorMatch, exactVectorMatch]
                },
                {
                    name: 'focused_evidence',
                    weight: 2,
                    results: [exactFocusedMatch]
                }
            ]
        })

        expect(results[0]).toMatchObject({
            chunk_id: 'chunk-tlt',
            document_id: 'doc-tlt',
            similarity: 0.88,
            rrf: {
                channels: ['vector', 'focused_evidence']
            }
        })
        expect(results[0]?.rrf?.score).toBeGreaterThan(results[1]?.rrf?.score ?? 0)
    })

    it('dedupes chunks without ids by document and normalized content while preserving channel evidence', () => {
        const keywordMatch: TestChunk = {
            document_id: 'doc-obs',
            document_title: 'Ders Materyalleri',
            document_type: 'pdf',
            content: 'Ders içerikleri ÖBS üzerinden paylaşılır.',
            similarity: 0.62,
            source_url: 'https://example.edu.tr/obs.pdf'
        }
        const titleMatch: TestChunk = {
            ...keywordMatch,
            content: '  Ders içerikleri   ÖBS üzerinden paylaşılır. ',
            similarity: 0.7
        }

        const results = mergeHybridRagResults({
            query: 'Ders içeriklerine nereden ulaşabilirim?',
            limit: 3,
            channels: [
                {
                    name: 'keyword',
                    results: [keywordMatch]
                },
                {
                    name: 'title_source',
                    results: [titleMatch]
                }
            ]
        })

        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({
            document_id: 'doc-obs',
            similarity: 0.7,
            rrf: {
                channels: ['keyword', 'title_source']
            }
        })
    })
})
