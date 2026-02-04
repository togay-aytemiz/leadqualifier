'use server'

import { createClient } from '@/lib/supabase/server'
import { generateInitialOfferingSuggestion } from '@/lib/leads/offering-profile'

export async function getOfferingProfile(organizationId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('offering_profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()
    return data
}

export async function getOfferingProfileSuggestions(organizationId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('offering_profile_suggestions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
    return data ?? []
}

export async function updateOfferingProfileSummary(
    organizationId: string,
    summary: string,
    aiSuggestionsEnabled: boolean
) {
    const supabase = await createClient()
    await supabase
        .from('offering_profiles')
        .update({ summary, ai_suggestions_enabled: aiSuggestionsEnabled })
        .eq('organization_id', organizationId)

    if (aiSuggestionsEnabled) {
        await generateInitialOfferingSuggestion({ organizationId, supabase })
    }
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
