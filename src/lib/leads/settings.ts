'use server'

import { createClient } from '@/lib/supabase/server'
import { generateInitialOfferingSuggestion } from '@/lib/leads/offering-profile'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import { normalizeServiceName } from '@/lib/leads/catalog'
import { normalizeServiceCatalogNames } from '@/lib/leads/offering-profile-utils'

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
    serviceCatalogAiEnabled: boolean,
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
        service_catalog_ai_enabled: serviceCatalogAiEnabled,
        required_intake_fields_ai_enabled: requiredIntakeFieldsAiEnabled,
        ai_suggestions_locale: aiSuggestionsLocale,
        required_intake_fields: requiredIntakeFields,
        required_intake_fields_ai: requiredIntakeFieldsAi
    }

    let { error } = await runUpdate(fullPayload)

    // Backward-compatible fallback for partially migrated databases.
    if (error?.message?.includes('service_catalog_ai_enabled')) {
        ({ error } = await runUpdate({
            summary,
            manual_profile_note: manualProfileNote,
            ai_suggestions_enabled: aiSuggestionsEnabled,
            required_intake_fields_ai_enabled: requiredIntakeFieldsAiEnabled,
            ai_suggestions_locale: aiSuggestionsLocale,
            required_intake_fields: requiredIntakeFields,
            required_intake_fields_ai: requiredIntakeFieldsAi
        }))
    }

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
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
    ensureNoError(error, 'Failed to read service candidates')
    return data ?? []
}

export async function getServiceCatalogItems(organizationId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('service_catalog')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('active', true)
        .order('created_at', { ascending: true })
    ensureNoError(error, 'Failed to load service catalog')
    return data ?? []
}

export async function syncServiceCatalogItems(
    organizationId: string,
    serviceNames: string[]
) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    const normalizedServiceNames = normalizeServiceCatalogNames(serviceNames)
    const desiredByKey = new Map(
        normalizedServiceNames.map((serviceName) => [normalizeServiceName(serviceName), serviceName] as const)
    )

    const { data: existingCatalog, error: existingCatalogError } = await supabase
        .from('service_catalog')
        .select('id, name, active')
        .eq('organization_id', organizationId)
    ensureNoError(existingCatalogError, 'Failed to read existing service catalog')

    const rows = existingCatalog ?? []
    const existingByKey = new Map(
        rows.map((item: { id: string; name: string; active: boolean }) => [normalizeServiceName(item.name), item] as const)
    )

    const activateIds: string[] = []
    const deactivateIds: string[] = []
    const insertRows: Array<{ organization_id: string; name: string; aliases: string[]; active: boolean }> = []

    for (const [key, label] of desiredByKey.entries()) {
        const existing = existingByKey.get(key)
        if (!existing) {
            insertRows.push({
                organization_id: organizationId,
                name: label,
                aliases: [],
                active: true
            })
            continue
        }

        if (!existing.active) {
            activateIds.push(existing.id)
        }
    }

    for (const row of rows as Array<{ id: string; name: string; active: boolean }>) {
        const key = normalizeServiceName(row.name)
        if (row.active && !desiredByKey.has(key)) {
            deactivateIds.push(row.id)
        }
    }

    if (activateIds.length > 0) {
        const { error } = await supabase
            .from('service_catalog')
            .update({ active: true })
            .in('id', activateIds)
        ensureNoError(error, 'Failed to activate service catalog items')
    }

    if (deactivateIds.length > 0) {
        const { error } = await supabase
            .from('service_catalog')
            .update({ active: false })
            .in('id', deactivateIds)
        ensureNoError(error, 'Failed to deactivate service catalog items')
    }

    if (insertRows.length > 0) {
        const { error } = await supabase
            .from('service_catalog')
            .insert(insertRows)
        ensureNoError(error, 'Failed to insert service catalog items')
    }
}

async function ensureServiceCatalogItemActive(options: {
    organizationId: string
    serviceName: string
}) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    const normalizedName = normalizeServiceName(options.serviceName)
    if (!normalizedName) return

    const { data: existingCatalog, error: existingCatalogError } = await supabase
        .from('service_catalog')
        .select('id, name, active')
        .eq('organization_id', options.organizationId)
    ensureNoError(existingCatalogError, 'Failed to read service catalog for candidate approval')

    const existingMatch = (existingCatalog ?? []).find((item: { name: string }) =>
        normalizeServiceName(item.name) === normalizedName
    ) as { id: string; active: boolean } | undefined

    if (!existingMatch) {
        const { error } = await supabase
            .from('service_catalog')
            .insert({
                organization_id: options.organizationId,
                name: options.serviceName.trim(),
                aliases: [],
                active: true
            })
        ensureNoError(error, 'Failed to add approved service to catalog')
        return
    }

    if (existingMatch.active) return

    const { error } = await supabase
        .from('service_catalog')
        .update({ active: true })
        .eq('id', existingMatch.id)
    ensureNoError(error, 'Failed to reactivate approved service')
}

export async function reviewServiceCandidate(
    organizationId: string,
    candidateId: string,
    status: 'approved' | 'rejected'
) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    ensureNoError(authError, 'Failed to read auth user')
    if (!user) throw new Error('Unauthorized')

    const { data: candidate, error: candidateError } = await supabase
        .from('service_candidates')
        .select('id, proposed_name')
        .eq('organization_id', organizationId)
        .eq('id', candidateId)
        .maybeSingle()
    ensureNoError(candidateError, 'Failed to read service candidate')
    if (!candidate) throw new Error('Service candidate not found')

    const reviewedAt = new Date().toISOString()
    const { error: reviewError } = await supabase
        .from('service_candidates')
        .update({
            status,
            reviewed_at: reviewedAt,
            reviewed_by: user.id
        })
        .eq('organization_id', organizationId)
        .eq('id', candidateId)
    ensureNoError(reviewError, 'Failed to update service candidate status')

    if (status === 'approved') {
        await ensureServiceCatalogItemActive({
            organizationId,
            serviceName: candidate.proposed_name
        })
    }

    return candidate
}
