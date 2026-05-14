import { describe, expect, it } from 'vitest'

import { buildRagContext } from '@/lib/knowledge-base/rag'

describe('buildRagContext', () => {
    it('adds document metadata around chunks so answer generation can use titles and source URLs as evidence', () => {
        const result = buildRagContext([
            {
                document_id: 'doc-1',
                document_title: 'Boards',
                source_url: 'https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/fakulte-hakkinda/kurullar',
                content: 'Board of Coordinators\nProf. Dr. Ayla KURKCUOGLU'
            }
        ])

        expect(result.context).toContain('Document Title: Boards')
        expect(result.context).toContain('Source URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/fakulte-hakkinda/kurullar')
        expect(result.context).toContain('Board of Coordinators')
        expect(result.chunks).toHaveLength(1)
    })

    it('keeps existing crawler page metadata without duplicating the same title/source header', () => {
        const result = buildRagContext([
            {
                document_id: 'doc-1',
                document_title: 'Öğrenci Hareketliliği',
                content: 'Page Title: Öğrenci Hareketliliği\nSource URL: https://example.edu.tr/erasmus\n\nBaşvuru şartları metni.'
            }
        ])

        expect(result.context.match(/Page Title: Öğrenci Hareketliliği/g)).toHaveLength(1)
        expect(result.context).not.toContain('Document Title: Öğrenci Hareketliliği')
        expect(result.context.match(/Source URL: https:\/\/example.edu.tr\/erasmus/g)).toHaveLength(1)
    })
})
