import { describe, expect, it } from 'vitest'
import { scoreLead } from '@/lib/leads/scoring'

describe('scoreLead', () => {
    it('scores a strong lead', () => {
        const result = scoreLead({
            hasCatalogMatch: true,
            hasProfileMatch: true,
            hasDate: true,
            hasBudget: true,
            isDecisive: true,
            isUrgent: true,
            isIndecisive: false,
            isFarFuture: false
        })
        expect(result.totalScore).toBe(10)
        expect(result.status).toBe('hot')
    })

    it('caps score when no service match', () => {
        const result = scoreLead({
            hasCatalogMatch: false,
            hasProfileMatch: false,
            hasDate: true,
            hasBudget: true,
            isDecisive: true,
            isUrgent: true,
            isIndecisive: false,
            isFarFuture: false
        })
        expect(result.totalScore).toBeLessThanOrEqual(3)
        expect(result.status).toBe('cold')
    })

    it('marks ignored when non-business', () => {
        const result = scoreLead({
            hasCatalogMatch: true,
            hasProfileMatch: true,
            hasDate: true,
            hasBudget: true,
            isDecisive: true,
            isUrgent: true,
            isIndecisive: false,
            isFarFuture: false,
            nonBusiness: true
        })
        expect(result.status).toBe('ignored')
        expect(result.totalScore).toBe(0)
    })
})
