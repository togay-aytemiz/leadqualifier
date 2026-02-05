'use server'

import { createClient } from '@/lib/supabase/server'
import type { OrganizationAiSettings, AiMode, AiBotMode } from '@/types/database'
import { DEFAULT_BOT_NAME, DEFAULT_FLEXIBLE_PROMPT, DEFAULT_STRICT_FALLBACK_TEXT, normalizeBotName } from '@/lib/ai/prompts'

const DEFAULT_AI_SETTINGS: Omit<OrganizationAiSettings, 'organization_id' | 'created_at' | 'updated_at'> = {
    mode: 'flexible',
    bot_mode: 'active',
    match_threshold: 0.6,
    prompt: DEFAULT_FLEXIBLE_PROMPT,
    bot_name: DEFAULT_BOT_NAME,
    allow_lead_extraction_during_operator: false
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function normalizeMode(): AiMode {
    return 'flexible'
}

function normalizeBotMode(mode: string | null | undefined): AiBotMode {
    if (mode === 'active' || mode === 'shadow' || mode === 'off') {
        return mode
    }
    return 'active'
}

function resolvePrompt(prompt: string | null | undefined) {
    const trimmed = (prompt ?? '').toString().trim()
    if (trimmed) {
        if (trimmed === DEFAULT_STRICT_FALLBACK_TEXT) {
            return DEFAULT_FLEXIBLE_PROMPT
        }
        return trimmed
    }
    return DEFAULT_FLEXIBLE_PROMPT
}

function applyAiDefaults(
    settings: Partial<OrganizationAiSettings> | null
): Omit<OrganizationAiSettings, 'organization_id' | 'created_at' | 'updated_at'> {
    const mode = normalizeMode()

    return {
        mode,
        bot_mode: normalizeBotMode(settings?.bot_mode ?? DEFAULT_AI_SETTINGS.bot_mode),
        match_threshold: clamp(Number(settings?.match_threshold ?? DEFAULT_AI_SETTINGS.match_threshold), 0, 1),
        prompt: resolvePrompt(settings?.prompt),
        bot_name: normalizeBotName(settings?.bot_name),
        allow_lead_extraction_during_operator: Boolean(
            settings?.allow_lead_extraction_during_operator ?? DEFAULT_AI_SETTINGS.allow_lead_extraction_during_operator
        )
    }
}

export async function getOrgAiSettings(organizationId: string, options?: { supabase?: any }) {
    const supabase = options?.supabase ?? await createClient()

    const { data, error } = await supabase
        .from('organization_ai_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()

    if (error) {
        if (process.env.AI_SETTINGS_DEBUG === '1') {
            console.error('Failed to load AI settings:', error)
        }
        return applyAiDefaults(null)
    }

    return applyAiDefaults(data as Partial<OrganizationAiSettings>)
}

async function getOrganizationIdForUser(supabase: any) {
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

export async function updateOrgAiSettings(updates: Partial<OrganizationAiSettings>) {
    const supabase = await createClient()
    const member = await getOrganizationIdForUser(supabase)

    if (member.role !== 'owner' && member.role !== 'admin') {
        throw new Error('Forbidden')
    }

    const current = await getOrgAiSettings(member.organization_id, { supabase })
    const normalized = applyAiDefaults({
        ...current,
        ...updates,
        mode: 'flexible'
    })

    const { error } = await supabase
        .from('organization_ai_settings')
        .upsert({
            organization_id: member.organization_id,
            ...normalized
        }, { onConflict: 'organization_id' })

    if (error) {
        console.error('Failed to update AI settings:', error)
        throw new Error(error.message)
    }

    return normalized
}
