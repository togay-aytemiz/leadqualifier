import { describe, expect, it } from 'vitest'
import { normalizeServiceName, isNewCandidate } from '@/lib/leads/catalog'

describe('catalog helpers', () => {
    it('normalizes service names', () => {
        expect(normalizeServiceName('  Newborn Shoot ')).toBe('newborn shoot')
    })

    it('detects new candidates', () => {
        const existing = ['newborn shoot', 'maternity']
        expect(isNewCandidate('Newborn Shoot', existing)).toBe(false)
        expect(isNewCandidate('Family', existing)).toBe(true)
    })
})
