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
})
