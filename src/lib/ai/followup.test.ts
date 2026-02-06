import { describe, expect, it } from 'vitest'
import {
    appendFollowupQuestion,
    buildRequiredIntakeFollowupGuidance,
    parseRequiredIntakeFollowupPayload
} from '@/lib/ai/followup'

describe('appendFollowupQuestion', () => {
    it('appends follow-up question when provided', () => {
        expect(appendFollowupQuestion('Merhaba', 'Hangi hizmet?'))
            .toBe('Merhaba\n\nHangi hizmet?')
    })

    it('returns reply unchanged when follow-up is empty', () => {
        expect(appendFollowupQuestion('Merhaba', '  ')).toBe('Merhaba')
    })
})

describe('parseRequiredIntakeFollowupPayload', () => {
    it('parses object payload with missing fields and follow-up question', () => {
        const payload = '{"missing_fields":["Telefon","Bütçe"],"followup_question":"Telefon ve bütçe paylaşır mısınız?"}'
        expect(parseRequiredIntakeFollowupPayload(payload)).toEqual({
            missingFields: ['Telefon', 'Bütçe'],
            followupQuestion: 'Telefon ve bütçe paylaşır mısınız?'
        })
    })

    it('parses fenced JSON payloads with surrounding text', () => {
        const payload = 'Sonuç:\n```json\n{"missing_fields":["Tarih"],"followup_question":"Hangi tarih uygundur?"}\n```'
        expect(parseRequiredIntakeFollowupPayload(payload)).toEqual({
            missingFields: ['Tarih'],
            followupQuestion: 'Hangi tarih uygundur?'
        })
    })

    it('returns null for invalid payload', () => {
        expect(parseRequiredIntakeFollowupPayload('not json')).toBeNull()
    })
})

describe('buildRequiredIntakeFollowupGuidance', () => {
    it('returns null when no required fields exist', () => {
        expect(buildRequiredIntakeFollowupGuidance([], ['merhaba'])).toBeNull()
    })

    it('returns guidance with fields and customer history', () => {
        const guidance = buildRequiredIntakeFollowupGuidance(['Telefon', 'Tarih'], ['Fiyat alabilir miyim?'])
        expect(guidance).toContain('Telefon')
        expect(guidance).toContain('Fiyat alabilir miyim?')
    })

    it('includes last assistant reply when provided', () => {
        const guidance = buildRequiredIntakeFollowupGuidance(
            ['Telefon'],
            ['Fiyat soruyorum'],
            ['Merhaba, size nasıl yardımcı olabilirim?', 'Elbette yardımcı olurum.']
        )
        expect(guidance).toContain('Recent assistant replies')
        expect(guidance).toContain('Merhaba, size nasıl yardımcı olabilirim?')
        expect(guidance).toContain('Elbette yardımcı olurum.')
    })
})
