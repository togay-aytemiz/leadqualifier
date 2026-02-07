'use server'

import { createClient } from '@/lib/supabase/server'
import { Lead, ConversationPlatform, LeadStatus } from '@/types/database'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

export interface LeadWithConversation extends Lead {
    conversation: {
        contact_name: string
        platform: ConversationPlatform
    }
}

export interface GetLeadsParams {
    page?: number
    pageSize?: number
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    search?: string
}

export interface GetLeadsResult {
    leads: LeadWithConversation[]
    total: number
    page: number
    pageSize: number
    totalPages: number
}

async function getUserOrganization(organizationIdOverride?: string | null) {
    if (organizationIdOverride) {
        return organizationIdOverride
    }

    const supabase = await createClient()
    const context = await resolveActiveOrganizationContext(supabase)
    return context?.activeOrganizationId ?? null
}

export async function getLeads(params: GetLeadsParams = {}, organizationIdOverride?: string | null): Promise<GetLeadsResult> {
    const {
        page = 1,
        pageSize = 20,
        sortBy = 'updated_at',
        sortOrder = 'desc',
        search
    } = params

    const organizationId = await getUserOrganization(organizationIdOverride)
    if (!organizationId) {
        return { leads: [], total: 0, page: 1, pageSize, totalPages: 0 }
    }

    const supabase = await createClient()

    // Map frontend sort keys to database columns
    let sortColumn = sortBy
    if (sortBy === 'contact_name') {
        sortColumn = 'conversation.contact_name'
    } else if (sortBy === 'platform') {
        sortColumn = 'conversation.platform'
    }

    // Build base query
    let query = supabase
        .from('leads')
        .select(`
            *,
            conversation:conversations!inner(
                contact_name,
                platform
            )
        `, { count: 'exact' })
        .eq('organization_id', organizationId)

    // Apply search filter
    if (search) {
        query = query.ilike('conversation.contact_name', `%${search}%`)
    }

    // Apply sorting and pagination
    // Note: sorting by foreign table columns requires specific syntax if not using dot notation directly supported by PostgREST
    // But for ' conversation.contact_name' order() might need specific handling or just work.
    // Supabase JS client usually accepts 'foreignTable(column)' or dict syntax for ordering.
    // However, simplest is to try direct column path. If generic sortColumn fails for foreign tables, we might need a switch.

    // For now, assume standard ordering works. If 'conversation.contact_name' fails, we might revert to fetching all and sorting in memory (bad for pagination) or use RPC.
    // Actually, ordering by foreign column in Supabase is tricky with nested resources. 
    // Standard Supabase `.order()` on the root table doesn't sort by joined table columns easily.
    // Let's stick to basic sorting for now (leads table columns). 
    // If user sorts by contact_name, we might need to handle it differently, 
    // but lets try passing it directly first. PostgREST supports it if the resource is embedded.

    // Correction: PostgREST ordering on embedded resource:
    // .order('contact_name', { foreignTable: 'conversation', ascending: ... })

    // Apply sorting
    if (sortColumn === 'conversation.contact_name') {
        // foreignTable ordering is dynamically handled
        query = query.order('contact_name', { foreignTable: 'conversation', ascending: sortOrder === 'asc' })
    } else if (sortColumn === 'conversation.platform') {
        query = query.order('platform', { foreignTable: 'conversation', ascending: sortOrder === 'asc' })
    } else {
        query = query.order(sortColumn, { ascending: sortOrder === 'asc' })
    }

    const offset = (page - 1) * pageSize
    const { data: leads, count, error } = await query
        .range(offset, offset + pageSize - 1)

    if (error) {
        console.error('Error fetching leads:', error)
        return { leads: [], total: 0, page: 1, pageSize, totalPages: 0 }
    }

    const total = count ?? 0
    const totalPages = Math.ceil(total / pageSize)

    // Ensure data is serializable (fix for "Only plain objects" error)
    const plainLeads = JSON.parse(JSON.stringify(leads ?? []))

    return {
        leads: plainLeads as LeadWithConversation[],
        total,
        page,
        pageSize,
        totalPages
    }
}

export async function getRequiredFields(organizationIdOverride?: string | null): Promise<string[]> {
    const organizationId = await getUserOrganization(organizationIdOverride)
    if (!organizationId) return []

    const supabase = await createClient()

    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('required_intake_fields, required_intake_fields_ai')
        .eq('organization_id', organizationId)
        .single()

    if (!profile) return []

    // Combine manual and AI required fields
    const manualFields = profile.required_intake_fields ?? []
    const aiFields = profile.required_intake_fields_ai ?? []

    return [...new Set([...manualFields, ...aiFields])]
}
