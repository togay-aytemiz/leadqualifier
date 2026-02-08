'use server'

import { createClient } from '@/lib/supabase/server'
import { generateInitialOfferingSuggestion } from '@/lib/leads/offering-profile'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'

function ensureNoError(error: { message?: string } | null, context: string) {
    if (!error) return
    throw new Error(`${context}: ${error.message ?? 'Unknown Supabase error'}`)
}

export async function getOfferingProfile(organizationId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('offering_profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()
    ensureNoError(error, 'Failed to load offering profile')
    return data
}

export async function getOfferingProfileSuggestions(
    organizationId: string,
    locale?: string,
    options?: { includeArchived?: boolean }
) {
    const supabase = await createClient()
    let query = supabase
        .from('offering_profile_suggestions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

    if (!options?.includeArchived) {
        query = query.is('archived_at', null)
    }

    if (locale?.trim()) {
        query = query.eq('locale', locale)
    }

    const { data, error } = await query
    ensureNoError(error, 'Failed to load offering profile suggestions')
    return data ?? []
}

export async function updateOfferingProfileSummary(
    organizationId: string,
    summary: string,
    manualProfileNote: string,
    aiSuggestionsEnabled: boolean,
    requiredIntakeFieldsAiEnabled: boolean,
    aiSuggestionsLocale: string,
    requiredIntakeFields: string[],
    requiredIntakeFieldsAi: string[],
    options?: { generateInitialSuggestion?: boolean }
) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    const runUpdate = async (payload: Record<string, unknown>) => {
        return supabase
            .from('offering_profiles')
            .update(payload)
            .eq('organization_id', organizationId)
    }

    const fullPayload = {
        summary,
        manual_profile_note: manualProfileNote,
        ai_suggestions_enabled: aiSuggestionsEnabled,
        required_intake_fields_ai_enabled: requiredIntakeFieldsAiEnabled,
        ai_suggestions_locale: aiSuggestionsLocale,
        required_intake_fields: requiredIntakeFields,
        required_intake_fields_ai: requiredIntakeFieldsAi
    }

    let { error } = await runUpdate(fullPayload)

    // Backward-compatible fallback for partially migrated databases.
    if (error?.message?.includes('required_intake_fields_ai_enabled')) {
        ({ error } = await runUpdate({
            summary,
            manual_profile_note: manualProfileNote,
            ai_suggestions_enabled: aiSuggestionsEnabled,
            ai_suggestions_locale: aiSuggestionsLocale,
            required_intake_fields: requiredIntakeFields,
            required_intake_fields_ai: requiredIntakeFieldsAi
        }))
    }

    if (error?.message?.includes('required_intake_fields_ai')) {
        ({ error } = await runUpdate({
            summary,
            manual_profile_note: manualProfileNote,
            ai_suggestions_enabled: aiSuggestionsEnabled,
            ai_suggestions_locale: aiSuggestionsLocale,
            required_intake_fields: requiredIntakeFields
        }))
    }

    if (error?.message?.includes('manual_profile_note')) {
        ({ error } = await runUpdate({
            summary,
            ai_suggestions_enabled: aiSuggestionsEnabled,
            ai_suggestions_locale: aiSuggestionsLocale,
            required_intake_fields: requiredIntakeFields
        }))
    }

    ensureNoError(error, 'Failed to update offering profile')

    if (aiSuggestionsEnabled && options?.generateInitialSuggestion !== false) {
        await generateInitialOfferingSuggestion({ organizationId, supabase })
    }
}

export async function syncOfferingProfileSummary(
    organizationId: string,
    summary: string
) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const { error } = await supabase
        .from('offering_profiles')
        .update({ summary })
        .eq('organization_id', organizationId)
    ensureNoError(error, 'Failed to sync offering profile summary')
}

export async function generateOfferingProfileSuggestions(organizationId: string) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const { data: profile, error } = await supabase
        .from('offering_profiles')
        .select('ai_suggestions_enabled')
        .eq('organization_id', organizationId)
        .maybeSingle()
    ensureNoError(error, 'Failed to read offering profile suggestion settings')

    if (!profile?.ai_suggestions_enabled) return false

    const suggestion = await generateInitialOfferingSuggestion({ organizationId, supabase, skipExistingCheck: true })
    return Boolean(suggestion)
}

export async function updateOfferingProfileLocaleForUser(locale: string) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    ensureNoError(authError, 'Failed to read auth user')
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

    const { error: updateError } = await supabase
        .from('offering_profiles')
        .update({ ai_suggestions_locale: locale })
        .eq('organization_id', membership.organization_id)
    ensureNoError(updateError, 'Failed to update offering profile locale')
}

export async function updateOfferingProfileSuggestionStatus(
    organizationId: string,
    suggestionId: string,
    status: 'pending' | 'approved' | 'rejected'
) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    ensureNoError(authError, 'Failed to read auth user')
    if (!user) throw new Error('Unauthorized')

    const { data: suggestion, error: suggestionError } = await supabase
        .from('offering_profile_suggestions')
        .select('id, content, update_of')
        .eq('organization_id', organizationId)
        .eq('id', suggestionId)
        .maybeSingle()
    ensureNoError(suggestionError, 'Failed to read offering profile suggestion')
    if (!suggestion) throw new Error('Offering profile suggestion not found')

    const reviewedAt = new Date().toISOString()

    if (status === 'approved' && suggestion?.update_of) {
        const { error: updateBaseError } = await supabase
            .from('offering_profile_suggestions')
            .update({
                content: suggestion.content,
                status: 'approved',
                reviewed_at: reviewedAt,
                reviewed_by: user.id
            })
            .eq('organization_id', organizationId)
            .eq('id', suggestion.update_of)
        ensureNoError(updateBaseError, 'Failed to apply update suggestion to base item')
    }

    const { error: reviewError } = await supabase
        .from('offering_profile_suggestions')
        .update({
            status,
            reviewed_at: reviewedAt,
            reviewed_by: user.id
        })
        .eq('organization_id', organizationId)
        .eq('id', suggestionId)
    ensureNoError(reviewError, 'Failed to update offering profile suggestion status')
}

export async function archiveOfferingProfileSuggestion(
    organizationId: string,
    suggestionId: string
) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    ensureNoError(authError, 'Failed to read auth user')
    if (!user) throw new Error('Unauthorized')

    const { data: suggestion, error: suggestionError } = await supabase
        .from('offering_profile_suggestions')
        .select('id, status, archived_at')
        .eq('organization_id', organizationId)
        .eq('id', suggestionId)
        .maybeSingle()
    ensureNoError(suggestionError, 'Failed to read suggestion for archive')

    if (!suggestion) return false
    if (suggestion.archived_at) return true
    if (suggestion.status !== 'rejected') return false

    const archivedAt = new Date().toISOString()

    const { error: archiveError } = await supabase
        .from('offering_profile_suggestions')
        .update({ archived_at: archivedAt })
        .eq('organization_id', organizationId)
        .eq('id', suggestionId)
    ensureNoError(archiveError, 'Failed to archive suggestion')

    return true
}

export async function getPendingOfferingProfileSuggestionCount(organizationId: string) {
    const supabase = await createClient()
    const query = supabase
        .from('offering_profile_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .is('archived_at', null)
        .or('status.eq.pending,status.is.null')

    const { count, error } = await query
    ensureNoError(error, 'Failed to read pending suggestion count')
    return count ?? 0
}

export async function getServiceCandidates(organizationId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('service_candidates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    ensureNoError(error, 'Failed to read service candidates')
    return data ?? []
}
