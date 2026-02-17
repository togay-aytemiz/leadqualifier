import { describe, expect, it } from 'vitest'
import {
    buildCreditUsageSummary,
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

    it('builds credit usage summary from usage debit ledger rows', () => {
        const summary = buildCreditUsageSummary(
            [
                {
                    created_at: '2026-02-08T12:00:00.000Z',
                    credits_delta: -1.2,
                    metadata: { category: 'summary' }
                },
                {
                    created_at: '2026-02-09T12:00:00.000Z',
                    credits_delta: -0.5,
                    metadata: { category: 'lead_extraction' }
                },
                {
                    created_at: '2026-02-10T12:00:00.000Z',
                    credits_delta: 0.2,
                    metadata: { category: 'summary' }
                }
            ],
            {
                now: new Date('2026-02-10T12:30:00.000Z'),
                timeZone: 'Europe/Istanbul'
            }
        )

        expect(summary.month).toBe('2026-02')
        expect(summary.monthly.credits).toBeCloseTo(1.7, 5)
        expect(summary.total.credits).toBeCloseTo(1.7, 5)
        expect(summary.monthly.count).toBe(2)
        expect(summary.total.count).toBe(2)
        expect(summary.monthly.byCategory.summary).toBeCloseTo(1.2, 5)
        expect(summary.monthly.byCategory.lead_extraction).toBeCloseTo(0.5, 5)
    })

    it('uses calendar month boundaries in the configured timezone instead of UTC', () => {
        const summary = buildCreditUsageSummary(
            [
                {
                    created_at: '2026-01-31T20:30:00.000Z',
                    credits_delta: -0.2,
                    metadata: { category: 'router' }
                },
                {
                    created_at: '2026-01-31T21:30:00.000Z',
                    credits_delta: -0.3,
                    metadata: { category: 'router' }
                }
            ],
            {
                now: new Date('2026-02-15T09:00:00.000Z'),
                timeZone: 'Europe/Istanbul'
            }
        )

        expect(summary.month).toBe('2026-02')
        expect(summary.monthly.credits).toBeCloseTo(0.3, 5)
        expect(summary.total.credits).toBeCloseTo(0.5, 5)
        expect(summary.monthly.count).toBe(1)
        expect(summary.total.count).toBe(2)
    })

    it('builds user-friendly breakdown buckets including document processing sources', () => {
        const summary = buildCreditUsageSummary(
            [
                {
                    created_at: '2026-02-08T12:00:00.000Z',
                    credits_delta: -0.4,
                    metadata: { category: 'router' }
                },
                {
                    created_at: '2026-02-08T12:05:00.000Z',
                    credits_delta: -0.6,
                    metadata: { category: 'rag' }
                },
                {
                    created_at: '2026-02-08T12:10:00.000Z',
                    credits_delta: -0.2,
                    metadata: { category: 'summary' }
                },
                {
                    created_at: '2026-02-08T12:15:00.000Z',
                    credits_delta: -0.3,
                    metadata: { category: 'lead_extraction', source: 'whatsapp' }
                },
                {
                    created_at: '2026-02-08T12:20:00.000Z',
                    credits_delta: -0.5,
                    metadata: { category: 'lead_extraction', source: 'offering_profile_suggestion' }
                },
                {
                    created_at: '2026-02-08T12:25:00.000Z',
                    credits_delta: -0.2,
                    metadata: { category: 'lead_extraction', source: 'required_intake_fields' }
                }
            ],
            {
                now: new Date('2026-02-10T09:00:00.000Z'),
                timeZone: 'Europe/Istanbul'
            }
        )

        expect(summary.monthly.breakdown.aiReplies).toBeCloseTo(1.0, 5)
        expect(summary.monthly.breakdown.conversationSummary).toBeCloseTo(0.2, 5)
        expect(summary.monthly.breakdown.leadExtraction).toBeCloseTo(0.3, 5)
        expect(summary.monthly.breakdown.documentProcessing).toBeCloseTo(0.7, 5)
    })
})
