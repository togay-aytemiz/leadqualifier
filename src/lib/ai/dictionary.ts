'use server'

import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import {
    sanitizeAiDictionaryEntries,
    type AiDictionaryDraftEntry,
    type OrganizationAiDictionaryEntry,
} from '@/lib/ai/dictionary-core'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

interface GetOrgAiDictionaryEntriesOptions {
    supabase?: SupabaseClientLike
    enabledOnly?: boolean
}

async function getOrganizationIdForUser(supabase: SupabaseClientLike) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: member, error } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    if (error || !member) throw new Error('No organization found')
    return member
}

export async function getOrgAiDictionaryEntries(
    organizationId: string,
    options?: GetOrgAiDictionaryEntriesOptions
) {
    const supabase = options?.supabase ?? await createClient()
    let query = supabase
        .from('organization_ai_dictionary_entries')
        .select('*')
        .eq('organization_id', organizationId)
        .order('term', { ascending: true })

    if (options?.enabledOnly) {
        query = query.eq('enabled', true)
    }

    const { data, error } = await query
    if (error) {
        if (process.env.AI_DICTIONARY_DEBUG === '1') {
            console.error('Failed to load AI dictionary entries:', error)
        }
        return []
    }

    return (data ?? []) as OrganizationAiDictionaryEntry[]
}

export async function updateOrgAiDictionaryEntries(entries: AiDictionaryDraftEntry[]) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const member = await getOrganizationIdForUser(supabase)

    if (member.role !== 'owner' && member.role !== 'admin') {
        throw new Error('Forbidden')
    }

    const sanitized = sanitizeAiDictionaryEntries(entries)
    const { error: deleteError } = await supabase
        .from('organization_ai_dictionary_entries')
        .delete()
        .eq('organization_id', member.organization_id)

    if (deleteError) {
        console.error('Failed to replace AI dictionary entries:', deleteError)
        throw new Error(deleteError.message)
    }

    if (sanitized.length > 0) {
        const { error: insertError } = await supabase
            .from('organization_ai_dictionary_entries')
            .insert(sanitized.map((entry) => ({
                organization_id: member.organization_id,
                ...entry,
            })))

        if (insertError) {
            console.error('Failed to save AI dictionary entries:', insertError)
            throw new Error(insertError.message)
        }
    }

    return getOrgAiDictionaryEntries(member.organization_id, { supabase })
}
