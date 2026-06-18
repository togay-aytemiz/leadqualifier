import { describe, expect, it } from 'vitest'

import {
    formatAiDictionaryContext,
    normalizeAiDictionaryMeanings,
    normalizeAiDictionaryTerm,
} from './dictionary-core'

describe('AI dictionary helpers', () => {
    it('normalizes terms and meanings for storage', () => {
        expect(normalizeAiDictionaryTerm('  FTR  ')).toBe('ftr')
        expect(normalizeAiDictionaryTerm('YIU')).toBe('yiu')
        expect(normalizeAiDictionaryTerm('Tıp TR')).toBe('tıp tr')
        expect(normalizeAiDictionaryMeanings([
            ' Fizyoterapi ve Rehabilitasyon ',
            '',
            'Fizyoterapi ön lisans',
            'Fizyoterapi ön lisans'
        ])).toEqual([
            'Fizyoterapi ve Rehabilitasyon',
            'Fizyoterapi ön lisans'
        ])
    })

    it('formats multiple meanings as scope-only query writer context', () => {
        const context = formatAiDictionaryContext([
            {
                id: 'dict-1',
                organization_id: 'org-1',
                term: 'ftr',
                normalized_term: 'ftr',
                meanings: ['Fizyoterapi ve Rehabilitasyon', 'Fizyoterapi ön lisans'],
                enabled: true,
                created_at: '2026-06-18T00:00:00Z',
                updated_at: '2026-06-18T00:00:00Z'
            },
            {
                id: 'dict-2',
                organization_id: 'org-1',
                term: 'dkt',
                normalized_term: 'dkt',
                meanings: ['Dil ve Konuşma Terapisi'],
                enabled: true,
                created_at: '2026-06-18T00:00:00Z',
                updated_at: '2026-06-18T00:00:00Z'
            },
            {
                id: 'dict-3',
                organization_id: 'org-1',
                term: 'off',
                normalized_term: 'off',
                meanings: ['Disabled meaning'],
                enabled: false,
                created_at: '2026-06-18T00:00:00Z',
                updated_at: '2026-06-18T00:00:00Z'
            }
        ])

        expect(context).toContain('ftr => Fizyoterapi ve Rehabilitasyon | Fizyoterapi ön lisans')
        expect(context).toContain('dkt => Dil ve Konuşma Terapisi')
        expect(context).not.toContain('Disabled meaning')
    })
})
