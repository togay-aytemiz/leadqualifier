'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import type { OrganizationBillingRegion } from '@/types/database'
import type { DeleteOrganizationDataInput } from '@/lib/organizations/data-deletion'
import { normalizeDeleteOrganizationDataInput } from '@/lib/organizations/data-deletion'

interface EditableOrganizationMembership {
    organizationId: string
}

export interface DeleteOrganizationDataResult {
    deletedConversations: number
    deletedAiUsageRows: number
}

async function requireEditableOrganizationMembership(
    supabase: Awaited<ReturnType<typeof createClient>>
): Promise<EditableOrganizationMembership> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    if (memberError || !member) {
        throw new Error('No organization found')
    }

    if (member.role !== 'owner' && member.role !== 'admin') {
        throw new Error('Forbidden')
    }

    return {
        organizationId: member.organization_id
    }
}

async function requireEditableOrganizationMembershipForOrg(
    supabase: Awaited<ReturnType<typeof createClient>>,
    organizationId: string
) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .maybeSingle()

    if (memberError || !member) {
        throw new Error('No organization membership found')
    }

    if (member.role !== 'owner' && member.role !== 'admin') {
        throw new Error('Forbidden')
    }
}

function normalizeBillingRegion(value: string): OrganizationBillingRegion | null {
    const normalized = value.trim().toUpperCase()
    if (normalized === 'TR') return 'TR'
    if (normalized === 'INTL') return 'INTL'
    return null
}

async function verifyCurrentUserPassword(
    supabase: Awaited<ReturnType<typeof createClient>>,
    password: string
) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const email = (user.email ?? '').trim()
    if (!email) {
        throw new Error('Password verification is unavailable for this account')
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Auth configuration is missing')
    }

    const authClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    })

    const { data, error } = await authClient.auth.signInWithPassword({
        email,
        password
    })

    if (error || !data.user || data.user.id !== user.id) {
        throw new Error('Invalid password')
    }
}

export async function updateOrganizationName(name: string) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const membership = await requireEditableOrganizationMembership(supabase)

    const { error } = await supabase
        .from('organizations')
        .update({
            name,
            updated_at: new Date().toISOString()
        })
        .eq('id', membership.organizationId)

    if (error) {
        console.error('Failed to update organization:', error)
        throw new Error(error.message)
    }
}

export async function updateOrganizationBillingRegion(billingRegion: string) {
    const normalizedBillingRegion = normalizeBillingRegion(billingRegion)
    if (!normalizedBillingRegion) {
        throw new Error('Invalid billing region')
    }

    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const membership = await requireEditableOrganizationMembership(supabase)

    const { error } = await supabase
        .from('organizations')
        .update({
            billing_region: normalizedBillingRegion,
            updated_at: new Date().toISOString()
        })
        .eq('id', membership.organizationId)

    if (error) {
        console.error('Failed to update organization billing region:', error)
        throw new Error(error.message)
    }
}

export async function deleteOrganizationDataSelfServe(input: DeleteOrganizationDataInput): Promise<DeleteOrganizationDataResult> {
    const normalizedInput = normalizeDeleteOrganizationDataInput(input)
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    await requireEditableOrganizationMembershipForOrg(supabase, normalizedInput.organizationId)
    await verifyCurrentUserPassword(supabase, normalizedInput.password)

    const { data: conversations, error: conversationsError } = await supabase
        .from('conversations')
        .select('id')
        .eq('organization_id', normalizedInput.organizationId)

    if (conversationsError) {
        console.error('Failed to load conversations for organization data deletion:', conversationsError)
        throw new Error('Failed to load organization conversations')
    }

    const conversationIds = (conversations ?? []).map((row) => row.id)
    if (conversationIds.length === 0) {
        return {
            deletedConversations: 0,
            deletedAiUsageRows: 0
        }
    }

    let deletedAiUsageRows = 0
    for (const conversationId of conversationIds) {
        const { data: deletedUsageRows, error: usageDeleteError } = await supabase
            .from('organization_ai_usage')
            .delete()
            .eq('organization_id', normalizedInput.organizationId)
            .eq('metadata->>conversation_id', conversationId)
            .select('id')

        if (usageDeleteError) {
            console.error('Failed to delete AI usage metadata for organization data deletion:', usageDeleteError)
            throw new Error('Failed to delete AI usage metadata')
        }

        deletedAiUsageRows += deletedUsageRows?.length ?? 0
    }

    const { data: deletedConversations, error: deleteConversationsError } = await supabase
        .from('conversations')
        .delete()
        .eq('organization_id', normalizedInput.organizationId)
        .in('id', conversationIds)
        .select('id')

    if (deleteConversationsError) {
        console.error('Failed to delete conversations for organization data deletion:', deleteConversationsError)
        throw new Error('Failed to delete organization conversations')
    }

    return {
        deletedConversations: deletedConversations?.length ?? 0,
        deletedAiUsageRows
    }
}
