'use server'

import { createClient } from '@/lib/supabase/server'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import type {
    OrganizationAiSettings,
    AiMode,
    AiBotMode,
    HumanEscalationAction
} from '@/types/database'
import {
    DEFAULT_HANDOVER_MESSAGE_EN,
    DEFAULT_HANDOVER_MESSAGE_TR
} from '@/lib/ai/escalation'
import {
    DEFAULT_BOT_DISCLAIMER_MESSAGE_EN,
    DEFAULT_BOT_DISCLAIMER_MESSAGE_TR
} from '@/lib/ai/bot-disclaimer'
import {
    DEFAULT_BOT_NAME,
    DEFAULT_FLEXIBLE_PROMPT,
    DEFAULT_FLEXIBLE_PROMPT_TR,
    DEFAULT_STRICT_FALLBACK_TEXT,
    normalizeBotName
} from '@/lib/ai/prompts'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>
type AiSettingsLegacyRow = Partial<OrganizationAiSettings> & {
    hot_lead_handover_message?: string | null
    hot_lead_handover_message_tr?: string | null
    hot_lead_handover_message_en?: string | null
}

const DEFAULT_AI_SETTINGS: Omit<OrganizationAiSettings, 'organization_id' | 'created_at' | 'updated_at'> = {
    mode: 'flexible',
    bot_mode: 'active',
    match_threshold: 0.6,
    prompt: DEFAULT_FLEXIBLE_PROMPT,
    bot_name: DEFAULT_BOT_NAME,
    bot_disclaimer_enabled: true,
    bot_disclaimer_message_tr: DEFAULT_BOT_DISCLAIMER_MESSAGE_TR,
    bot_disclaimer_message_en: DEFAULT_BOT_DISCLAIMER_MESSAGE_EN,
    allow_lead_extraction_during_operator: false,
    hot_lead_score_threshold: 7,
    hot_lead_action: 'notify_only',
    hot_lead_handover_message_tr: DEFAULT_HANDOVER_MESSAGE_TR,
    hot_lead_handover_message_en: DEFAULT_HANDOVER_MESSAGE_EN
}

const EN_DEFAULT_PROMPT_SIGNATURES = [
    'you are the ai assistant for a business.',
    "be concise, friendly, and respond in the user's language.",
    'never invent prices, policies, services, or guarantees.',
    'if you are unsure, ask a single clarifying question.',
    'when generating fallback guidance, only use the provided list of topics.'
]

const TR_DEFAULT_PROMPT_SIGNATURES = [
    'sen bir işletme için yapay zeka asistanısın.',
    'kısa, samimi ve kullanıcının dilinde yanıt ver.',
    'fiyat, politika, hizmet veya garanti uydurma.',
    'emin değilsen tek bir netleştirici soru sor.',
    'yönlendirici fallback yanıtı üretirken yalnızca verilen konu listesini kullan.'
]

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

function normalizeHotLeadAction(action: string | null | undefined): HumanEscalationAction {
    if (action === 'notify_only' || action === 'switch_to_operator') {
        return action
    }
    return DEFAULT_AI_SETTINGS.hot_lead_action
}

function normalizeBotDisclaimerEnabled(value: boolean | null | undefined) {
    if (typeof value === 'boolean') return value
    return DEFAULT_AI_SETTINGS.bot_disclaimer_enabled
}

function resolveBotDisclaimerMessage(message: string | null | undefined, fallback: string) {
    const trimmed = (message ?? '').toString().trim()
    return trimmed || fallback
}

function resolveHandoverMessage(message: string | null | undefined, fallback: string) {
    const trimmed = (message ?? '').toString().trim()
    return trimmed || fallback
}

function resolveLocalizedHandoverMessages(settings: Partial<OrganizationAiSettings> | null) {
    const legacySettings = (settings ?? {}) as AiSettingsLegacyRow
    const legacyRaw = legacySettings.hot_lead_handover_message
    const legacyMessage = (legacyRaw ?? '').toString().trim()
    const hasLegacyMessage = legacyMessage.length > 0
    const legacyLooksTurkish = /[çğıöşüÇĞİÖŞÜ]/.test(legacyMessage)

    const trRaw = (legacySettings.hot_lead_handover_message_tr ?? '').toString().trim()
    const enRaw = (legacySettings.hot_lead_handover_message_en ?? '').toString().trim()

    const trFallback = hasLegacyMessage && legacyLooksTurkish
        ? legacyMessage
        : DEFAULT_AI_SETTINGS.hot_lead_handover_message_tr
    const enFallback = hasLegacyMessage && !legacyLooksTurkish
        ? legacyMessage
        : DEFAULT_AI_SETTINGS.hot_lead_handover_message_en

    let trMessage = resolveHandoverMessage(trRaw, trFallback)
    let enMessage = resolveHandoverMessage(enRaw, enFallback)

    // Repair older rows where both localized columns were accidentally stored with EN default text.
    if (
        trMessage === DEFAULT_HANDOVER_MESSAGE_EN &&
        enMessage === DEFAULT_HANDOVER_MESSAGE_EN
    ) {
        trMessage = DEFAULT_HANDOVER_MESSAGE_TR
    }

    // Symmetric repair: keep EN default if both localized columns are TR default text.
    if (
        trMessage === DEFAULT_HANDOVER_MESSAGE_TR &&
        enMessage === DEFAULT_HANDOVER_MESSAGE_TR
    ) {
        enMessage = DEFAULT_HANDOVER_MESSAGE_EN
    }

    return {
        hot_lead_handover_message_tr: trMessage,
        hot_lead_handover_message_en: enMessage
    }
}

function resolveLocalizedBotDisclaimerMessages(settings: Partial<OrganizationAiSettings> | null) {
    return {
        bot_disclaimer_message_tr: resolveBotDisclaimerMessage(
            settings?.bot_disclaimer_message_tr,
            DEFAULT_AI_SETTINGS.bot_disclaimer_message_tr
        ),
        bot_disclaimer_message_en: resolveBotDisclaimerMessage(
            settings?.bot_disclaimer_message_en,
            DEFAULT_AI_SETTINGS.bot_disclaimer_message_en
        )
    }
}

function resolvePromptForLocale(prompt: string | null | undefined, locale: string | null | undefined) {
    const normalizedLocale = (locale ?? '').toString().toLowerCase()
    const localizedDefaultPrompt = normalizedLocale.startsWith('tr')
        ? DEFAULT_FLEXIBLE_PROMPT_TR
        : DEFAULT_FLEXIBLE_PROMPT

    const trimmed = (prompt ?? '').toString().trim()
    if (trimmed) {
        if (trimmed === DEFAULT_STRICT_FALLBACK_TEXT) {
            return localizedDefaultPrompt
        }
        if (trimmed === DEFAULT_FLEXIBLE_PROMPT || trimmed === DEFAULT_FLEXIBLE_PROMPT_TR) {
            return localizedDefaultPrompt
        }
        const normalized = trimmed.toLowerCase()
        const matchesEnDefaultFamily = EN_DEFAULT_PROMPT_SIGNATURES.every(signature => normalized.includes(signature))
        const matchesTrDefaultFamily = TR_DEFAULT_PROMPT_SIGNATURES.every(signature => normalized.includes(signature))
        if (matchesEnDefaultFamily || matchesTrDefaultFamily) {
            return localizedDefaultPrompt
        }
        return trimmed
    }
    return localizedDefaultPrompt
}

function applyAiDefaults(
    settings: Partial<OrganizationAiSettings> | null,
    locale: string | null | undefined = 'en'
): Omit<OrganizationAiSettings, 'organization_id' | 'created_at' | 'updated_at'> {
    const mode = normalizeMode()
    const localizedHandoverMessages = resolveLocalizedHandoverMessages(settings)
    const localizedBotDisclaimerMessages = resolveLocalizedBotDisclaimerMessages(settings)

    return {
        mode,
        bot_mode: normalizeBotMode(settings?.bot_mode ?? DEFAULT_AI_SETTINGS.bot_mode),
        match_threshold: clamp(Number(settings?.match_threshold ?? DEFAULT_AI_SETTINGS.match_threshold), 0, 1),
        prompt: resolvePromptForLocale(settings?.prompt, locale),
        bot_name: normalizeBotName(settings?.bot_name),
        bot_disclaimer_enabled: normalizeBotDisclaimerEnabled(settings?.bot_disclaimer_enabled),
        bot_disclaimer_message_tr: localizedBotDisclaimerMessages.bot_disclaimer_message_tr,
        bot_disclaimer_message_en: localizedBotDisclaimerMessages.bot_disclaimer_message_en,
        allow_lead_extraction_during_operator: Boolean(
            settings?.allow_lead_extraction_during_operator ?? DEFAULT_AI_SETTINGS.allow_lead_extraction_during_operator
        ),
        hot_lead_score_threshold: Math.round(clamp(
            Number(settings?.hot_lead_score_threshold ?? DEFAULT_AI_SETTINGS.hot_lead_score_threshold),
            0,
            10
        )),
        hot_lead_action: normalizeHotLeadAction(settings?.hot_lead_action),
        hot_lead_handover_message_tr: localizedHandoverMessages.hot_lead_handover_message_tr,
        hot_lead_handover_message_en: localizedHandoverMessages.hot_lead_handover_message_en
    }
}

export async function getOrgAiSettings(
    organizationId: string,
    options?: { supabase?: SupabaseClientLike; locale?: string | null }
) {
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
        return applyAiDefaults(null, options?.locale)
    }

    return applyAiDefaults(data as Partial<OrganizationAiSettings>, options?.locale)
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

export async function updateOrgAiSettings(updates: Partial<OrganizationAiSettings>) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
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
