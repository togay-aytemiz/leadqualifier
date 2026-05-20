import { describe, expect, it } from 'vitest'

import { appendCanonicalRagSourceLinks } from '@/lib/knowledge-base/rag-source-links'

describe('appendCanonicalRagSourceLinks', () => {
    it('removes malformed spaced source URL fragments before appending canonical source links', () => {
        const response = 'https://yuksekihtisasuniversitesi. edu. tr/iletisim Başka bir konuda yardımcı olabilir miyim?'

        const formatted = appendCanonicalRagSourceLinks(response, [{
            source_url: 'https://yuksekihtisasuniversitesi.edu.tr/iletisim'
        }])

        expect(formatted).toBe('Başka bir konuda yardımcı olabilir miyim?\nhttps://yuksekihtisasuniversitesi.edu.tr/iletisim')
        expect(formatted).not.toContain('edu. tr')
    })

    it('can limit forced source-link answers to the single best source', () => {
        const formatted = appendCanonicalRagSourceLinks('Sayfa burada:', [
            { source_url: 'https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim' },
            { source_url: 'https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/spor-bilimleri-fakultesi/akademik-takvim' }
        ], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Sayfa burada:\nhttps://yuksekihtisasuniversitesi.edu.tr/akademik-takvim')
    })

    it('normalizes model-written multiple raw URLs to one URL when chunk metadata is unavailable', () => {
        const response = [
            'Akademik takvim linki:',
            'https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim',
            'https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/spor-bilimleri-fakultesi/akademik-takvim'
        ].join(' ')

        const formatted = appendCanonicalRagSourceLinks(response, [], {
            force: true,
            limit: 1
        })

        expect(formatted).toBe('Akademik takvim linki:\nhttps://yuksekihtisasuniversitesi.edu.tr/akademik-takvim')
    })
})
