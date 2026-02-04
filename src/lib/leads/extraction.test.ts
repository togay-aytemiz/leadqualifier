import { describe, expect, it } from 'vitest'
import { safeParseLeadExtraction } from '@/lib/leads/extraction'

describe('safeParseLeadExtraction', () => {
    it('fills defaults on invalid payloads', () => {
        const result = safeParseLeadExtraction('{"service_type": "Newborn"}')
        expect(result.service_type).toBe('Newborn')
        expect(result.non_business).toBe(false)
    })
})
