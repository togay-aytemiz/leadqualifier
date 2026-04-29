import { describe, expect, it, vi } from 'vitest'

import type { SkillMatch } from '@/types/database'
import { filterSkillMatchesByIntentGate, matchSkillsSafely, matchSkillsWithStatus } from '@/lib/skills/match-safe'

describe('matchSkillsSafely', () => {
    it('returns matcher results as-is', async () => {
        const expected: SkillMatch[] = [{
            skill_id: 'skill-1',
            title: 'Fiyat',
            response_text: 'Fiyat bilgisi',
            trigger_text: 'fiyat',
            similarity: 0.81
        }]
        const matcher = vi.fn(async () => expected)

        const result = await matchSkillsSafely({ matcher })

        expect(result).toEqual(expected)
        expect(matcher).toHaveBeenCalledTimes(1)
    })

    it('returns empty array when matcher throws', async () => {
        const matcher = vi.fn(async () => {
            throw new Error('embedding service down')
        })

        const result = await matchSkillsSafely({ matcher })

        expect(result).toEqual([])
    })

    it('keeps technical matcher errors distinguishable from no-match results', async () => {
        const matcherError = new Error('embedding service down')
        const matcher = vi.fn(async () => {
            throw matcherError
        })

        const result = await matchSkillsWithStatus({ matcher })

        expect(result).toEqual({
            status: 'error',
            matches: [],
            error: matcherError
        })
    })

    it('reports an empty successful matcher response as no_match', async () => {
        const matcher = vi.fn(async () => [])

        const result = await matchSkillsWithStatus({ matcher })

        expect(result).toEqual({
            status: 'no_match',
            matches: []
        })
    })
})

describe('filterSkillMatchesByIntentGate', () => {
    it('drops an ambiguous semantic match when the trigger lacks meaningful user-message anchors', () => {
        const matches: SkillMatch[] = [{
            skill_id: 'skill-complaint',
            title: 'Şikayet ve Memnuniyetsizlik',
            response_text: 'Yaşadığınız olumsuz deneyim için üzgünüz.',
            trigger_text: 'Hizmetten memnun kalmadım',
            similarity: 0.72
        }]

        const result = filterSkillMatchesByIntentGate({
            message: 'hizmetleriniz hakkında bilgi almak istiyorum',
            matches,
            threshold: 0.7
        })

        expect(result).toEqual([])
    })

    it('keeps a lower-ranked anchored match when the top semantic match is not anchored', () => {
        const matches: SkillMatch[] = [
            {
                skill_id: 'skill-complaint',
                title: 'Şikayet ve Memnuniyetsizlik',
                response_text: 'Yaşadığınız olumsuz deneyim için üzgünüz.',
                trigger_text: 'Bu konuda destek istiyorum',
                similarity: 0.72
            },
            {
                skill_id: 'skill-service-info',
                title: 'Hizmet Bilgisi',
                response_text: 'Elbette, hizmetlerimiz hakkında bilgi paylaşabilirim.',
                trigger_text: 'hizmetleriniz hakkında bilgi almak istiyorum',
                similarity: 0.7
            }
        ]

        const result = filterSkillMatchesByIntentGate({
            message: 'hizmetleriniz hakkında bilgi almak istiyorum',
            matches,
            threshold: 0.7
        })

        expect(result.map((match) => match.skill_id)).toEqual(['skill-service-info'])
    })

    it('keeps fuzzy typo matches when the trigger and message share a strong non-generic anchor', () => {
        const matches: SkillMatch[] = [{
            skill_id: 'skill-complaint',
            title: 'Şikayet ve Memnuniyetsizlik',
            response_text: 'Yaşadığınız olumsuz deneyim için üzgünüz.',
            trigger_text: 'Şikayetim var',
            similarity: 0.64
        }]

        const result = filterSkillMatchesByIntentGate({
            message: 'şikayerim var',
            matches,
            threshold: 0.6
        })

        expect(result.map((match) => match.skill_id)).toEqual(['skill-complaint'])
    })

    it('keeps very high confidence semantic matches without requiring lexical overlap', () => {
        const matches: SkillMatch[] = [{
            skill_id: 'skill-human',
            title: 'İnsan Desteği Talebi',
            response_text: 'Sizi ekibimize aktarıyorum.',
            trigger_text: 'Yetkili biriyle konuşabilir miyim?',
            similarity: 0.88
        }]

        const result = filterSkillMatchesByIntentGate({
            message: 'can you connect me with staff',
            matches,
            threshold: 0.7
        })

        expect(result.map((match) => match.skill_id)).toEqual(['skill-human'])
    })
})
