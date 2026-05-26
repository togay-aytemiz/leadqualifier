import { describe, expect, it } from 'vitest'

import { chunkText } from './chunking'

describe('chunkText', () => {
    it('normalizes URL line-break artifacts before chunking', () => {
        const chunks = chunkText(`Kaynaklar

Detaylar için https://example.edu.
 tr/basvuru ve https://example.edu
 .tr/duyuru adreslerini inceleyin.`)

        const content = chunks.map((chunk) => chunk.content).join('\n')

        expect(content).toContain('https://example.edu.tr/basvuru')
        expect(content).toContain('https://example.edu.tr/duyuru')
        expect(content).not.toMatch(/https?:\/\/[^\s]*\s+\.[a-z]{2,}|https?:\/\/[^\s]+\.\s+[a-z]{2,}/i)
    })
})
