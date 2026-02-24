import { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type OrganizationScopedCountTable = 'organization_members' | 'skills' | 'knowledge_documents' | 'messages'

interface TokenUsageRow {
    total_tokens: number | null
}

function toNonNegativeInteger(value: unknown): number {
    const normalized = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value)
    if (!Number.isFinite(normalized)) return 0
    return Math.max(0, Math.floor(normalized))
}

function toNonNegativeNumber(value: unknown): number {
    const normalized = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
    if (!Number.isFinite(normalized)) return 0
    return Math.max(0, normalized)
}

export async function getCountByOrganization(
    supabase: SupabaseClient,
    organizationIds: string[],
    tableName: OrganizationScopedCountTable
): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    if (organizationIds.length === 0) return counts

    for (const organizationId of organizationIds) {
        const { count, error } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId)

        if (error) {
            console.error(`Failed to count ${tableName} for organization ${organizationId}:`, error)
            continue
        }

        counts.set(organizationId, toNonNegativeInteger(count))
    }

    return counts
}

export async function getTokenTotalsByOrganization(
    supabase: SupabaseClient,
    organizationIds: string[]
): Promise<Map<string, number>> {
    const totals = new Map<string, number>()
    if (organizationIds.length === 0) return totals

    const pageSize = 1000

    for (const organizationId of organizationIds) {
        let organizationTotal = 0
        let offset = 0

        while (true) {
            const { data, error } = await supabase
                .from('organization_ai_usage')
                .select('total_tokens')
                .eq('organization_id', organizationId)
                .order('created_at', { ascending: true })
                .range(offset, offset + pageSize - 1)

            if (error) {
                console.error(`Failed to load token usage for organization ${organizationId}:`, error)
                break
            }

            const rows = (data ?? []) as TokenUsageRow[]
            for (const row of rows) {
                organizationTotal += toNonNegativeNumber(row.total_tokens)
            }

            if (rows.length < pageSize) break
            offset += pageSize
        }

        totals.set(organizationId, Math.floor(organizationTotal))
    }

    return totals
}
