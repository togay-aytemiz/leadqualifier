import { describe, expect, it } from 'vitest'
import {
    analyzeRequiredIntakeState,
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

    it('suppresses intake forcing on policy/procedure request mode', () => {
        const guidance = buildRequiredIntakeFollowupGuidance(
            ['Bütçe', 'Zamanlama'],
            ['Randevumu iptal etmek istiyorum.']
        )

        expect(guidance).toContain('Current request mode: policy/procedure')
        expect(guidance).toContain('Do NOT force lead-intake collection questions')
    })

    it('adds refusal/no-progress guardrails for repeated resistance turns', () => {
        const guidance = buildRequiredIntakeFollowupGuidance(
            ['Bütçe'],
            ['Bu detayı paylaşmak istemiyorum.', 'Şimdilik bilmiyorum.']
        )

        expect(guidance).toContain('Guardrails:')
        expect(guidance).toContain('do not insist')
        expect(guidance).toContain('No-progress guard')
    })
})

describe('analyzeRequiredIntakeState', () => {
    it('uses dynamic minimum set on short conversations', () => {
        const state = analyzeRequiredIntakeState({
            requiredFields: ['Hizmet Türü', 'Bütçe', 'Konum', 'Tarih'],
            recentCustomerMessages: ['Fiyat alabilir miyim?', 'Bu hafta uygun musunuz?']
        })

        expect(state.dynamicMinimumCount).toBe(2)
        expect(state.effectiveRequiredFields.length).toBe(2)
        expect(state.missingFields.length).toBeLessThanOrEqual(2)
    })

    it('treats collected fields as blocked re-ask', () => {
        const state = analyzeRequiredIntakeState({
            requiredFields: ['Bütçe', 'Tarih'],
            recentCustomerMessages: ['Bütçem 2000 TL.'],
            leadSnapshot: {
                extracted_fields: {
                    required_intake_collected: {
                        Bütçe: '2000 TL'
                    }
                }
            }
        })

        expect(state.collectedFields).toContain('Bütçe')
        expect(state.blockedReaskFields).toContain('Bütçe')
    })

    it('blocks re-ask fields on refusal and suppresses intake on repeated resistance', () => {
        const state = analyzeRequiredIntakeState({
            requiredFields: ['Öğrenci Yaşı', 'Bütçe'],
            recentCustomerMessages: ['Yaşı paylaşmak istemiyorum.', 'Şimdilik bilmiyorum.'],
            recentAssistantMessages: [
                'Çocuğunuzun yaşı nedir?',
                'Çocuğunuzun yaşı nedir?'
            ]
        })

        expect(state.blockedReaskFields).toContain('Öğrenci Yaşı')
        expect(state.noProgressStreak).toBe(true)
        expect(state.suppressIntakeQuestions).toBe(true)
    })
})
