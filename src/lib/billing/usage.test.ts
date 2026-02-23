import { describe, expect, it, vi } from 'vitest'
import {
    buildCreditUsageSummary,
    buildMessageUsageTotals,
    calculateAiCreditsFromTokens,
    calculateKnowledgeStorageBytes,
    calculateSkillStorageBytes,
    getOrgCreditUsageSummary,
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

    it('loads all usage debit ledger rows beyond Supabase default 1000-row page', async () => {
        const organizationId = 'org_1'
        const ledgerRows = Array.from({ length: 1205 }, (_, index) => ({
            organization_id: organizationId,
            entry_type: 'usage_debit',
            created_at: new Date(Date.UTC(2026, 1, 1, 0, index)).toISOString(),
            credits_delta: -0.1,
            usage_id: `usage_${index + 1}`,
            metadata: { category: 'router' }
        }))
        const usageRows = ledgerRows.map((row) => ({
            id: row.usage_id,
            organization_id: organizationId,
            metadata: { source: 'whatsapp' }
        }))
        const supabase = createUsageSummarySupabaseMock({
            ledgerRows,
            usageRows
        })

        const summary = await getOrgCreditUsageSummary(organizationId, {
            supabase: supabase as never,
            now: new Date('2026-02-15T09:00:00.000Z'),
            timeZone: 'Europe/Istanbul'
        })

        expect(summary.month).toBe('2026-02')
        expect(summary.monthly.credits).toBeCloseTo(120.5, 5)
        expect(summary.total.credits).toBeCloseTo(120.5, 5)
        expect(summary.monthly.count).toBe(1205)
        expect(summary.total.count).toBe(1205)
    })
})

interface UsageSummarySupabaseRow {
    organization_id: string
    entry_type?: string
    created_at?: string
    credits_delta?: number
    usage_id?: string
    metadata?: unknown
    id?: string
}

function createUsageSummarySupabaseMock(options: {
    ledgerRows: UsageSummarySupabaseRow[]
    usageRows: UsageSummarySupabaseRow[]
}) {
    const ledgerQuery = createLedgerQueryMock(options.ledgerRows)
    const usageInMock = vi.fn(async (_column: string, values: string[]) => {
        const idSet = new Set(values)
        return {
            data: options.usageRows
                .filter((row) => row.organization_id === ledgerQuery.getOrganizationFilter())
                .filter((row) => typeof row.id === 'string' && idSet.has(row.id))
                .map((row) => ({
                    id: row.id,
                    metadata: row.metadata ?? {}
                })),
            error: null
        }
    })
    const usageEqMock = vi.fn((_column: string, value: string) => {
        ledgerQuery.setOrganizationFilter(value)
        return {
            in: usageInMock
        }
    })
    const usageSelectMock = vi.fn(() => ({
        eq: usageEqMock
    }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'organization_credit_ledger') return ledgerQuery.query
        if (table === 'organization_ai_usage') {
            return {
                select: usageSelectMock
            }
        }

        throw new Error(`Unexpected table: ${table}`)
    })

    return {
        from: fromMock
    }
}

function createLedgerQueryMock(rows: UsageSummarySupabaseRow[]) {
    let organizationFilter = ''
    let entryTypeFilter = ''
    let orderedByCreatedAt = false
    let orderAscending = true

    const getFilteredRows = () => rows
        .filter((row) => !organizationFilter || row.organization_id === organizationFilter)
        .filter((row) => !entryTypeFilter || row.entry_type === entryTypeFilter)
        .slice()
        .sort((left, right) => {
            if (!orderedByCreatedAt) return 0
            const leftMs = new Date(left.created_at ?? '').getTime()
            const rightMs = new Date(right.created_at ?? '').getTime()
            return orderAscending ? leftMs - rightMs : rightMs - leftMs
        })

    const buildRows = (rangeStart: number, rangeEnd: number) => getFilteredRows()
        .slice(rangeStart, rangeEnd + 1)
        .map((row) => ({
            created_at: row.created_at ?? '',
            credits_delta: row.credits_delta ?? 0,
            usage_id: row.usage_id ?? null,
            metadata: row.metadata ?? {}
        }))

    const rangeMock = vi.fn(async (from: number, to: number) => ({
        data: buildRows(from, to),
        error: null
    }))
    const orderMock = vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderedByCreatedAt = column === 'created_at'
        orderAscending = options?.ascending !== false
        return query
    })
    const eqMock = vi.fn((column: string, value: string) => {
        if (column === 'organization_id') organizationFilter = value
        if (column === 'entry_type') entryTypeFilter = value
        return query
    })
    const selectMock = vi.fn(() => query)

    const query = {
        select: selectMock,
        eq: eqMock,
        order: orderMock,
        range: rangeMock,
        then: (resolve: (value: { data: Array<{
            created_at: string
            credits_delta: number
            usage_id: string | null
            metadata: unknown
        }>; error: null }) => unknown) => resolve({
            data: buildRows(0, 999),
            error: null
        })
    }

    return {
        query,
        setOrganizationFilter: (value: string) => {
            organizationFilter = value
        },
        getOrganizationFilter: () => organizationFilter
    }
}
