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
    aiSuggestionsEnabled: boolean,
    aiSuggestionsLocale: string
) {
    const supabase = await createClient()
    await supabase
        .from('offering_profiles')
        .update({ summary, ai_suggestions_enabled: aiSuggestionsEnabled, ai_suggestions_locale: aiSuggestionsLocale })
        .eq('organization_id', organizationId)

    if (aiSuggestionsEnabled) {
        await generateInitialOfferingSuggestion({ organizationId, supabase })
    }
}

export async function updateOfferingProfileLocaleForUser(locale: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: membership, error: membershipError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    if (membershipError || !membership) {
        throw new Error('No organization found')
    }

    await supabase
        .from('offering_profiles')
        .update({ ai_suggestions_locale: locale })
        .eq('organization_id', membership.organization_id)
}

export async function updateOfferingProfileSuggestionStatus(
    organizationId: string,
    suggestionId: string,
    status: 'pending' | 'approved' | 'rejected'
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    await supabase
        .from('offering_profile_suggestions')
        .update({
            status,
            reviewed_at: new Date().toISOString(),
            reviewed_by: user.id
        })
        .eq('organization_id', organizationId)
        .eq('id', suggestionId)
}

export async function getPendingOfferingProfileSuggestionCount(organizationId: string) {
    const supabase = await createClient()
    const { count } = await supabase
        .from('offering_profile_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'pending')

    return count ?? 0
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
