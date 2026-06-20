import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
    'supabase/migrations/20260620053214_match_skills_unique_candidates.sql',
    'utf8'
)

describe('match_skills unique candidate migration', () => {
    it('ranks embedding rows inside each Skill before limiting the result set', () => {
        expect(source).toMatch(/ROW_NUMBER\(\)\s+OVER\s*\(\s*PARTITION BY s\.id/iu)
        expect(source).toMatch(/ORDER BY se\.embedding <=> query_embedding/iu)

        const bestRowFilterIndex = source.indexOf('embedding_rank = 1')
        const resultLimitIndex = source.indexOf('LIMIT match_count')

        expect(bestRowFilterIndex).toBeGreaterThan(-1)
        expect(resultLimitIndex).toBeGreaterThan(bestRowFilterIndex)
    })

    it('preserves the Skill-level routing metadata returned to the selector', () => {
        expect(source).toContain('routing_description TEXT')
        expect(source).toContain('coverage_facets TEXT[]')
        expect(source).toContain('trigger_text TEXT')
        expect(source).toContain('similarity FLOAT')
    })
})
