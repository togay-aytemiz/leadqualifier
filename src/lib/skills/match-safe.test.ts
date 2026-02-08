import { describe, expect, it, vi } from 'vitest'

import type { SkillMatch } from '@/types/database'
import { matchSkillsSafely } from '@/lib/skills/match-safe'

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
})
