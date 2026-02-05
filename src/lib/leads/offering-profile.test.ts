import { describe, expect, it } from 'vitest'
import { parseSuggestionPayload } from '@/lib/leads/offering-profile-utils'

describe('parseSuggestionPayload', () => {
    it('parses suggestion with update_index', () => {
        const result = parseSuggestionPayload('{"suggestion":"Intro\n- A\n- B","update_index":2}')
        expect(result).toEqual({ suggestion: 'Intro\n- A\n- B', updateIndex: 2 })
    })

    it('parses suggestion without update_index', () => {
        const result = parseSuggestionPayload('{"suggestion":"Intro\n- A"}')
        expect(result).toEqual({ suggestion: 'Intro\n- A', updateIndex: null })
    })

    it('returns null for invalid payload', () => {
        const result = parseSuggestionPayload('not-json')
        expect(result).toBeNull()
    })
})
