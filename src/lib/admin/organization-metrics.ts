import { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>
const DEFAULT_WHATSAPP_MEDIA_BUCKET = 'whatsapp-media'
const WHATSAPP_MEDIA_BUCKET = process.env.WHATSAPP_MEDIA_BUCKET?.trim() || DEFAULT_WHATSAPP_MEDIA_BUCKET

export type OrganizationScopedCountTable = 'organization_members' | 'skills' | 'knowledge_documents' | 'messages'

interface TokenUsageRow {
    total_tokens: number | null
}

interface OrganizationStorageUsageRpcRow {
    organization_id: string
    skills_bytes: number | string | null
    knowledge_bytes: number | string | null
    whatsapp_media_bytes: number | string | null
    whatsapp_media_object_count: number | string | null
    total_bytes: number | string | null
}

export interface OrganizationStorageUsageTotals {
    totalBytes: number
    skillsBytes: number
    knowledgeBytes: number
    whatsappMediaBytes: number
    whatsappMediaObjectCount: number
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

function toNonNegativeStorageBytes(value: unknown): number {
    const normalized = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
    if (!Number.isFinite(normalized)) return 0
    return Math.max(0, Math.round(normalized))
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

export async function getStorageUsageByOrganization(
    supabase: SupabaseClient,
    organizationIds: string[]
): Promise<Map<string, OrganizationStorageUsageTotals>> {
    const totals = new Map<string, OrganizationStorageUsageTotals>()
    if (organizationIds.length === 0) return totals

    let { data, error } = await supabase.rpc('get_organization_storage_usage', {
        target_organization_ids: organizationIds,
        target_media_bucket_ids: [WHATSAPP_MEDIA_BUCKET]
    })

    if (error) {
        const message = typeof error.message === 'string' ? error.message : ''
        if (message.includes('get_organization_storage_usage')) {
            const legacyRpc = await supabase.rpc('get_organization_storage_usage', {
                target_organization_ids: organizationIds
            })
            data = legacyRpc.data
            error = legacyRpc.error
        }
    }

    if (error) {
        console.error('Failed to load storage usage totals by organization:', error)
        return totals
    }

    for (const row of (data ?? []) as OrganizationStorageUsageRpcRow[]) {
        if (!row.organization_id) continue

        totals.set(row.organization_id, {
            totalBytes: toNonNegativeStorageBytes(row.total_bytes),
            skillsBytes: toNonNegativeStorageBytes(row.skills_bytes),
            knowledgeBytes: toNonNegativeStorageBytes(row.knowledge_bytes),
            whatsappMediaBytes: toNonNegativeStorageBytes(row.whatsapp_media_bytes),
            whatsappMediaObjectCount: toNonNegativeInteger(row.whatsapp_media_object_count)
        })
    }

    return totals
}
