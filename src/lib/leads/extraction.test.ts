import { describe, expect, it } from 'vitest'
import { safeParseLeadExtraction } from '@/lib/leads/extraction'

describe('safeParseLeadExtraction', () => {
    it('fills defaults on invalid payloads', () => {
        const result = safeParseLeadExtraction('{"service_type": "Newborn"}')
        expect(result.service_type).toBe('Newborn')
        expect(result.non_business).toBe(false)
        expect(result.score).toBe(0)
        expect(result.status).toBe('cold')
    })

    it('parses JSON wrapped in code fences', () => {
        const result = safeParseLeadExtraction('```json\n{"service_type":"Yenidoğan","intent_signals":["decisive"]}\n```')
        expect(result.service_type).toBe('Yenidoğan')
        expect(result.intent_signals).toEqual(['decisive'])
    })

    it('parses JSON when extra text surrounds the payload', () => {
        const result = safeParseLeadExtraction('Here is the result:\n{"service_type":"Yenidoğan","budget_signals":"price"}\nThanks.')
        expect(result.service_type).toBe('Yenidoğan')
        expect(result.budget_signals).toEqual(['price'])
    })

    it('normalizes scalar fields into arrays and booleans', () => {
        const result = safeParseLeadExtraction('{"intent_signals":"decisive","risk_signals":["delay", 1],"non_business":"false"}')
        expect(result.intent_signals).toEqual(['decisive'])
        expect(result.risk_signals).toEqual(['delay'])
        expect(result.non_business).toBe(false)
    })

    it('normalizes score and status values', () => {
        const result = safeParseLeadExtraction('{"score": 8.4, "status": "HOT"}')
        expect(result.score).toBe(8)
        expect(result.status).toBe('hot')
    })

    it('overrides score/status for non-business', () => {
        const result = safeParseLeadExtraction('{"score": 9, "status": "hot", "non_business": true}')
        expect(result.score).toBe(0)
        expect(result.status).toBe('ignored')
    })

    it('accepts localized score/status strings', () => {
        const result = safeParseLeadExtraction('{"score": "9/10", "status": "Sıcak"}')
        expect(result.score).toBe(9)
        expect(result.status).toBe('hot')
    })
})
