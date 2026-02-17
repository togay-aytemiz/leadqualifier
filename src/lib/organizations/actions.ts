'use server'

import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import type { OrganizationBillingRegion } from '@/types/database'

interface EditableOrganizationMembership {
    organizationId: string
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

function normalizeBillingRegion(value: string): OrganizationBillingRegion | null {
    const normalized = value.trim().toUpperCase()
    if (normalized === 'TR') return 'TR'
    if (normalized === 'INTL') return 'INTL'
    return null
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
