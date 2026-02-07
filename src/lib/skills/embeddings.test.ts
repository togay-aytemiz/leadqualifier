import { describe, expect, it } from 'vitest'
import { buildSkillEmbeddingTexts } from '@/lib/skills/embeddings'

describe('buildSkillEmbeddingTexts', () => {
    it('includes the skill title in addition to trigger examples', () => {
        const texts = buildSkillEmbeddingTexts('Pricing Information', [
            'What are your prices?',
            'How much does it cost?'
        ])

        expect(texts).toEqual([
            'Pricing Information',
            'What are your prices?',
            'How much does it cost?'
        ])
    })

    it('removes empty values and deduplicates repeated phrases', () => {
        const texts = buildSkillEmbeddingTexts('  ', [
            ' What are your prices? ',
            '',
            'What are your prices?',
            '   '
        ])

        expect(texts).toEqual(['What are your prices?'])
    })

    it('keeps title once even if it also appears in triggers', () => {
        const texts = buildSkillEmbeddingTexts('Acil Talep', [
            'Acil Talep',
            'Acil dönüş yapabilir misiniz?'
        ])

        expect(texts).toEqual(['Acil Talep', 'Acil dönüş yapabilir misiniz?'])
    })
})
