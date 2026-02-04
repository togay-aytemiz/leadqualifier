'use server'

import { createClient } from '@/lib/supabase/server'

export async function getOfferingProfile(organizationId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('offering_profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()
    return data
}

export async function getPendingProfileUpdates(organizationId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('offering_profile_updates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    return data ?? []
}

export async function approveProfileUpdate(id: string) {
    const supabase = await createClient()
    const { data: update } = await supabase
        .from('offering_profile_updates')
        .select('*')
        .eq('id', id)
        .single()

    if (!update) throw new Error('Update not found')

    await supabase
        .from('offering_profiles')
        .update({ summary: update.proposed_summary })
        .eq('organization_id', update.organization_id)

    await supabase
        .from('offering_profile_updates')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', id)
}

export async function rejectProfileUpdate(id: string) {
    const supabase = await createClient()
    await supabase
        .from('offering_profile_updates')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', id)
}

export async function getServiceCandidates(organizationId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('service_candidates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    return data ?? []
}

export async function approveServiceCandidate(id: string) {
    const supabase = await createClient()
    const { data: candidate } = await supabase
        .from('service_candidates')
        .select('*')
        .eq('id', id)
        .single()

    if (!candidate) throw new Error('Candidate not found')

    await supabase.from('service_catalog').insert({
        organization_id: candidate.organization_id,
        name: candidate.proposed_name,
        aliases: []
    })

    await supabase
        .from('service_candidates')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', id)
}

export async function rejectServiceCandidate(id: string) {
    const supabase = await createClient()
    await supabase
        .from('service_candidates')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', id)
}

export async function updateOfferingProfileSummary(
    organizationId: string,
    summary: string,
    catalogEnabled: boolean
) {
    const supabase = await createClient()
    await supabase
        .from('offering_profiles')
        .update({ summary, catalog_enabled: catalogEnabled })
        .eq('organization_id', organizationId)
}
