import { describe, expect, it, vi } from 'vitest'
import {
    buildCreditUsageSummary,
    buildMessageUsageTotals,
    calculateAiCreditsFromTokens,
    calculateKnowledgeStorageBytes,
    calculateSkillStorageBytes,
    getOrgCreditUsageSummary,
    getOrgStorageUsageSummary,
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

interface StorageUsageListItem {
    id: string | null
    name: string
    metadata?: { size?: number; contentLength?: number } | null
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

function createStorageUsageSupabaseMock(options: {
    rpcData?: unknown[]
    rpcError?: unknown
    skillsRows?: Array<{
        title: string | null
        response_text: string | null
        trigger_examples: string[] | null
    }>
    knowledgeRows?: Array<{
        title: string | null
        content: string | null
    }>
    storageRowsByPath?: Record<string, StorageUsageListItem[]>
}) {
    const rpcMock = vi.fn(async () => ({
        data: options.rpcData ?? [],
        error: options.rpcError ?? null
    }))
    const storageListMock = vi.fn(async (path: string, optionsArg?: { limit?: number; offset?: number }) => {
        const rows = options.storageRowsByPath?.[path] ?? []
        const offset = optionsArg?.offset ?? 0
        const limit = optionsArg?.limit ?? rows.length

        return {
            data: rows.slice(offset, offset + limit),
            error: null
        }
    })
    const storageFromMock = vi.fn((_bucketName: string) => ({
        list: storageListMock
    }))
    const fromMock = vi.fn((table: string) => {
        if (table === 'skills') {
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(async () => ({
                        data: options.skillsRows ?? [],
                        error: null
                    }))
                }))
            }
        }

        if (table === 'knowledge_documents') {
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(async () => ({
                        data: options.knowledgeRows ?? [],
                        error: null
                    }))
                }))
            }
        }

        throw new Error(`Unexpected table for storage summary mock: ${table}`)
    })

    return {
        rpc: rpcMock,
        from: fromMock,
        storage: {
            from: storageFromMock
        }
    }
}

describe('getOrgStorageUsageSummary', () => {
    it('uses RPC storage aggregate when available', async () => {
        const supabase = createStorageUsageSupabaseMock({
            rpcData: [{
                organization_id: 'org-1',
                skill_count: 3,
                knowledge_document_count: 2,
                skills_bytes: 1200,
                knowledge_bytes: 3400,
                whatsapp_media_object_count: 4,
                whatsapp_media_bytes: 8192,
                total_bytes: 12792
            }]
        })

        const summary = await getOrgStorageUsageSummary('org-1', {
            supabase: supabase as never
        })

        expect(summary).toEqual({
            totalBytes: 12792,
            skillsBytes: 1200,
            knowledgeBytes: 3400,
            whatsappMediaBytes: 8192,
            whatsappMediaObjectCount: 4,
            skillCount: 3,
            knowledgeDocumentCount: 2
        })
        expect(supabase.rpc).toHaveBeenCalledWith('get_organization_storage_usage', {
            target_organization_ids: ['org-1'],
            target_media_bucket_ids: ['whatsapp-media']
        })
        expect(supabase.from).not.toHaveBeenCalled()
    })

    it('falls back to skills + knowledge queries when RPC is unavailable', async () => {
        const supabase = createStorageUsageSupabaseMock({
            rpcError: { message: 'function missing' },
            skillsRows: [{
                title: 'S',
                response_text: 'AA',
                trigger_examples: ['B']
            }],
            knowledgeRows: [{
                title: 'Doc',
                content: 'Hello'
            }]
        })

        const summary = await getOrgStorageUsageSummary('org-1', {
            supabase: supabase as never
        })

        expect(summary).toEqual({
            totalBytes: 12,
            skillsBytes: 4,
            knowledgeBytes: 8,
            whatsappMediaBytes: 0,
            whatsappMediaObjectCount: 0,
            skillCount: 1,
            knowledgeDocumentCount: 1
        })
        expect(supabase.from).toHaveBeenCalledTimes(2)
    })

    it('reconciles WhatsApp media usage from storage listing when RPC media values are zero', async () => {
        const supabase = createStorageUsageSupabaseMock({
            rpcData: [{
                organization_id: 'org-1',
                skill_count: 3,
                knowledge_document_count: 2,
                skills_bytes: 1200,
                knowledge_bytes: 3400,
                whatsapp_media_object_count: 0,
                whatsapp_media_bytes: 0,
                total_bytes: 4600
            }],
            storageRowsByPath: {
                'org-1': [
                    { id: null, name: '1027043280489864', metadata: null }
                ],
                'org-1/1027043280489864': [
                    { id: 'obj-1', name: 'file-1.jpg', metadata: { size: 2000 } },
                    { id: 'obj-2', name: 'file-2.jpg', metadata: { contentLength: 3000 } }
                ]
            }
        })

        const summary = await getOrgStorageUsageSummary('org-1', {
            supabase: supabase as never
        })

        expect(summary).toEqual({
            totalBytes: 9600,
            skillsBytes: 1200,
            knowledgeBytes: 3400,
            whatsappMediaBytes: 5000,
            whatsappMediaObjectCount: 2,
            skillCount: 3,
            knowledgeDocumentCount: 2
        })
    })

    it('falls back to legacy storage RPC signature when bucket-aware RPC is unavailable', async () => {
        const rpcMock = vi
            .fn()
            .mockResolvedValueOnce({
                data: null,
                error: { message: 'function get_organization_storage_usage(uuid[], text[]) does not exist' }
            })
            .mockResolvedValueOnce({
                data: [{
                    organization_id: 'org-1',
                    skill_count: 1,
                    knowledge_document_count: 1,
                    skills_bytes: 100,
                    knowledge_bytes: 200,
                    whatsapp_media_object_count: 2,
                    whatsapp_media_bytes: 300,
                    total_bytes: 600
                }],
                error: null
            })
        const fromMock = vi.fn(() => {
            throw new Error('from should not be called for legacy rpc fallback')
        })
        const listMock = vi.fn(async () => ({ data: [], error: null }))
        const supabase = {
            rpc: rpcMock,
            from: fromMock,
            storage: {
                from: vi.fn(() => ({ list: listMock }))
            }
        }

        const summary = await getOrgStorageUsageSummary('org-1', {
            supabase: supabase as never
        })

        expect(rpcMock).toHaveBeenNthCalledWith(1, 'get_organization_storage_usage', {
            target_organization_ids: ['org-1'],
            target_media_bucket_ids: ['whatsapp-media']
        })
        expect(rpcMock).toHaveBeenNthCalledWith(2, 'get_organization_storage_usage', {
            target_organization_ids: ['org-1']
        })
        expect(summary).toEqual({
            totalBytes: 600,
            skillsBytes: 100,
            knowledgeBytes: 200,
            whatsappMediaBytes: 300,
            whatsappMediaObjectCount: 2,
            skillCount: 1,
            knowledgeDocumentCount: 1
        })
        expect(fromMock).not.toHaveBeenCalled()
    })
})
