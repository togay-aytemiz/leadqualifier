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

    it('adds concise response fact signals for semantic matching', () => {
        const texts = buildSkillEmbeddingTexts(
            'YİÜ Intent - 45 spor_antrenorluk_egitimi',
            [
                'Antrenörlük Eğitimi kontenjanı kaç?',
            ],
            [
                'Antrenörlük Eğitimi, Spor Bilimleri Fakültesi bünyesinde bir lisans programıdır. Balgat Yerleşkesinde eğitim verir.',
                '',
                'Puan türü: EA. 2025 kontenjan ve ücret bilgileri:',
                '- Ücretli: 2 kontenjan, 380.000 TL.',
                '- Burslu: 6 kontenjan.',
                '',
                'Kaynak notu: Tanıtım broşürü Spor Bilimleri Fakültesi tablosu.',
            ].join('\n')
        )

        expect(texts).toContain(
            'YİÜ Intent - 45 spor_antrenorluk_egitimi: Ücretli: 2 kontenjan, 380.000 TL.'
        )
        expect(texts).toContain(
            'YİÜ Intent - 45 spor_antrenorluk_egitimi: Puan türü: EA. 2025 kontenjan ve ücret bilgileri:'
        )
        expect(texts.some((text) => text.includes('Kaynak notu'))).toBe(false)
    })

    it('keeps routing descriptions out of embeddings while retaining positive scope signals', () => {
        const texts = buildSkillEmbeddingTexts(
            'YİÜ Intent - 71 ebelik_program_bilgileri',
            ['Ebelik kontenjanı kaç?'],
            'Ebelik, Sağlık Bilimleri Fakültesi bünyesinde bir lisans programıdır.',
            'Ebelik programına özel varlık, ücret, kontenjan, kampüs ve başarı sırası sorularını kapsar; genel üniversite sorularını kapsamaz.',
            ['program_existence', 'fee', 'quota', 'campus']
        )

        expect(texts.some((text) => text.includes('routing scope'))).toBe(false)
        expect(texts.some((text) => text.includes('genel üniversite sorularını kapsamaz'))).toBe(false)
        expect(texts).toContain('YİÜ Intent - 71 ebelik_program_bilgileri')
        expect(texts).toContain('Ebelik kontenjanı kaç?')
        expect(texts).toContain(
            'YİÜ Intent - 71 ebelik_program_bilgileri: coverage facet: quota'
        )
        expect(texts).toContain(
            'YİÜ Intent - 71 ebelik_program_bilgileri: Ebelik, Sağlık Bilimleri Fakültesi bünyesinde bir lisans programıdır.'
        )
    })
})
