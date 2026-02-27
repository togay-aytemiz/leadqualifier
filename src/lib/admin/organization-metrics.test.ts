import { describe, expect, it, vi } from 'vitest'

import {
    getCountByOrganization,
    getStorageUsageByOrganization,
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

    it('passes configured media bucket ids to storage usage RPC and maps totals', async () => {
        const rpcMock = vi.fn(async () => ({
            data: [
                {
                    organization_id: 'org_a',
                    total_bytes: 6000,
                    skills_bytes: 1000,
                    knowledge_bytes: 2000,
                    whatsapp_media_bytes: 3000,
                    whatsapp_media_object_count: 3
                }
            ],
            error: null
        }))
        const supabase = {
            rpc: rpcMock
        }

        const totals = await getStorageUsageByOrganization(
            supabase as never,
            ['org_a']
        )

        expect(rpcMock).toHaveBeenCalledWith('get_organization_storage_usage', {
            target_organization_ids: ['org_a'],
            target_media_bucket_ids: ['whatsapp-media']
        })
        expect(totals.get('org_a')).toEqual({
            totalBytes: 6000,
            skillsBytes: 1000,
            knowledgeBytes: 2000,
            whatsappMediaBytes: 3000,
            whatsappMediaObjectCount: 3
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
                data: [
                    {
                        organization_id: 'org_a',
                        total_bytes: 4500,
                        skills_bytes: 1000,
                        knowledge_bytes: 2000,
                        whatsapp_media_bytes: 1500,
                        whatsapp_media_object_count: 2
                    }
                ],
                error: null
            })
        const supabase = {
            rpc: rpcMock
        }

        const totals = await getStorageUsageByOrganization(
            supabase as never,
            ['org_a']
        )

        expect(rpcMock).toHaveBeenNthCalledWith(1, 'get_organization_storage_usage', {
            target_organization_ids: ['org_a'],
            target_media_bucket_ids: ['whatsapp-media']
        })
        expect(rpcMock).toHaveBeenNthCalledWith(2, 'get_organization_storage_usage', {
            target_organization_ids: ['org_a']
        })
        expect(totals.get('org_a')).toEqual({
            totalBytes: 4500,
            skillsBytes: 1000,
            knowledgeBytes: 2000,
            whatsappMediaBytes: 1500,
            whatsappMediaObjectCount: 2
        })
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
