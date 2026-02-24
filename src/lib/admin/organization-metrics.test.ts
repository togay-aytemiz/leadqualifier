import { describe, expect, it, vi } from 'vitest'

import {
    getCountByOrganization,
    getTokenTotalsByOrganization
} from './organization-metrics'

interface CountRow {
    organization_id: string
}

interface TokenUsageRow {
    organization_id: string
    total_tokens: number | null
}

describe('organization admin metrics helpers', () => {
    it('counts all rows per organization using exact head queries', async () => {
        const messageRows = [
            ...Array.from({ length: 950 }, () => ({ organization_id: 'org_a' } satisfies CountRow)),
            ...Array.from({ length: 120 }, () => ({ organization_id: 'org_b' } satisfies CountRow))
        ]
        const supabase = createCountSupabaseMock({
            messages: messageRows
        })

        const counts = await getCountByOrganization(
            supabase as never,
            ['org_a', 'org_b'],
            'messages'
        )

        expect(counts.get('org_a')).toBe(950)
        expect(counts.get('org_b')).toBe(120)
    })

    it('loads token totals beyond Supabase default 1000-row page', async () => {
        const usageRows = [
            ...Array.from({ length: 1205 }, () => ({
                organization_id: 'org_a',
                total_tokens: 1
            } satisfies TokenUsageRow)),
            ...Array.from({ length: 8 }, (_, index) => ({
                organization_id: 'org_b',
                total_tokens: index % 2 === 0 ? 2 : 3
            } satisfies TokenUsageRow))
        ]

        const supabase = createTokenSupabaseMock(usageRows)

        const totals = await getTokenTotalsByOrganization(
            supabase as never,
            ['org_a', 'org_b']
        )

        expect(totals.get('org_a')).toBe(1205)
        expect(totals.get('org_b')).toBe(20)
    })
})

function createCountSupabaseMock(rowsByTable: Record<string, CountRow[]>) {
    const fromMock = vi.fn((table: string) => ({
        select: vi.fn((_columns: string, options?: { count?: 'exact'; head?: boolean }) => {
            expect(options).toEqual({ count: 'exact', head: true })

            return {
                eq: vi.fn(async (column: string, value: string) => {
                    expect(column).toBe('organization_id')

                    return {
                        count: (rowsByTable[table] ?? []).filter((row) => row.organization_id === value).length,
                        error: null
                    }
                })
            }
        })
    }))

    return {
        from: fromMock
    }
}

function createTokenSupabaseMock(rows: TokenUsageRow[]) {
    const fromMock = vi.fn((table: string) => {
        if (table !== 'organization_ai_usage') {
            throw new Error(`Unexpected table: ${table}`)
        }

        let organizationFilter = ''

        const query = {
            select: vi.fn(() => query),
            eq: vi.fn((column: string, value: string) => {
                if (column === 'organization_id') {
                    organizationFilter = value
                }
                return query
            }),
            order: vi.fn(() => query),
            range: vi.fn(async (from: number, to: number) => {
                const filtered = rows.filter((row) => row.organization_id === organizationFilter)
                return {
                    data: filtered.slice(from, to + 1),
                    error: null
                }
            })
        }

        return query
    })

    return {
        from: fromMock
    }
}
