import { describe, expect, it } from 'vitest'
import { resolveLeadExtractionAllowance } from '@/lib/ai/bot-mode'

describe('resolveLeadExtractionAllowance', () => {
    it('disables extraction when bot mode is off even if operator allows', () => {
        const result = resolveLeadExtractionAllowance({
            botMode: 'off',
            operatorActive: true,
            allowDuringOperator: true
        })
        expect(result).toBe(false)
    })

    it('disables extraction during operator takeover by default', () => {
        const result = resolveLeadExtractionAllowance({
            botMode: 'active',
            operatorActive: true,
            allowDuringOperator: false
        })
        expect(result).toBe(false)
    })

    it('allows extraction during operator takeover when enabled', () => {
        const result = resolveLeadExtractionAllowance({
            botMode: 'active',
            operatorActive: true,
            allowDuringOperator: true
        })
        expect(result).toBe(true)
    })

    it('falls back to bot mode when operator is not active', () => {
        const result = resolveLeadExtractionAllowance({
            botMode: 'shadow',
            operatorActive: false,
            allowDuringOperator: false
        })
        expect(result).toBe(true)
    })
})
