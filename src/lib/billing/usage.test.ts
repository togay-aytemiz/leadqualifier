import { describe, expect, it } from 'vitest'
import {
    buildMessageUsageTotals,
    calculateAiCreditsFromTokens,
    calculateKnowledgeStorageBytes,
    calculateSkillStorageBytes,
    formatCreditAmount,
    formatStorageSize
} from './usage'

describe('billing usage helpers', () => {
    it('builds message usage totals including combined total', () => {
        expect(
            buildMessageUsageTotals({
                aiGenerated: 14,
                operatorSent: 9,
                incoming: 21
            })
        ).toEqual({
            aiGenerated: 14,
            operatorSent: 9,
            incoming: 21,
            totalMessages: 44
        })
    })

    it('calculates skill storage bytes from title, response, and triggers', () => {
        const bytes = calculateSkillStorageBytes([
            {
                title: 'Hello',
                response_text: 'World',
                trigger_examples: ['a', 'b']
            }
        ])

        expect(bytes).toBe(12)
    })

    it('calculates knowledge storage bytes from title and content', () => {
        const bytes = calculateKnowledgeStorageBytes([
            {
                title: 'Doc',
                content: 'Merhaba'
            }
        ])

        expect(bytes).toBe(10)
    })

    it('formats byte values in readable units', () => {
        expect(formatStorageSize(900, 'en')).toEqual({ value: '900', unit: 'B' })
        expect(formatStorageSize(2_048, 'en')).toEqual({ value: '2.00', unit: 'KB' })
        expect(formatStorageSize(5 * 1024 * 1024, 'en')).toEqual({ value: '5.00', unit: 'MB' })
    })

    it('calculates AI credits from weighted token totals', () => {
        expect(
            calculateAiCreditsFromTokens({
                inputTokens: 2_000,
                outputTokens: 250
            })
        ).toBe(1)
    })

    it('rounds credit amount up to one decimal place', () => {
        expect(
            calculateAiCreditsFromTokens({
                inputTokens: 1_000,
                outputTokens: 80
            })
        ).toBe(0.5)
    })

    it('formats credits with one decimal in locale-aware output', () => {
        expect(formatCreditAmount(12.3, 'en')).toBe('12.3')
        expect(formatCreditAmount(12.3, 'tr')).toBe('12,3')
    })
})
