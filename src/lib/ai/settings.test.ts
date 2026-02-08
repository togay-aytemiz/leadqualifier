import { describe, expect, it, vi } from 'vitest'
import { getOrgAiSettings } from './settings'
import { DEFAULT_HANDOVER_MESSAGE_EN, DEFAULT_HANDOVER_MESSAGE_TR } from './escalation'
import { DEFAULT_FLEXIBLE_PROMPT, DEFAULT_FLEXIBLE_PROMPT_TR } from './prompts'

type GetOrgAiSettingsSupabase = NonNullable<Parameters<typeof getOrgAiSettings>[1]>['supabase']

function createSupabaseMock(data: Record<string, unknown>, error: unknown = null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data, error })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })

    return { from, select, eq, maybeSingle }
}

describe('getOrgAiSettings handover message localization', () => {
    it('repairs TR message when both localized columns equal EN default', async () => {
        const supabase = createSupabaseMock({
            bot_mode: 'active',
            match_threshold: 0.6,
            prompt: 'x',
            bot_name: 'Bot',
            allow_lead_extraction_during_operator: false,
            hot_lead_score_threshold: 7,
            hot_lead_action: 'notify_only',
            hot_lead_handover_message_tr: DEFAULT_HANDOVER_MESSAGE_EN,
            hot_lead_handover_message_en: DEFAULT_HANDOVER_MESSAGE_EN
        })

        const settings = await getOrgAiSettings('org-1', {
            supabase: supabase as unknown as GetOrgAiSettingsSupabase
        })

        expect(settings.hot_lead_handover_message_tr).toBe(DEFAULT_HANDOVER_MESSAGE_TR)
        expect(settings.hot_lead_handover_message_en).toBe(DEFAULT_HANDOVER_MESSAGE_EN)
    })

    it('uses locale-aware defaults from legacy single handover message', async () => {
        const supabase = createSupabaseMock({
            bot_mode: 'active',
            match_threshold: 0.6,
            prompt: 'x',
            bot_name: 'Bot',
            allow_lead_extraction_during_operator: false,
            hot_lead_score_threshold: 7,
            hot_lead_action: 'notify_only',
            hot_lead_handover_message: DEFAULT_HANDOVER_MESSAGE_EN,
            hot_lead_handover_message_tr: '',
            hot_lead_handover_message_en: ''
        })

        const settings = await getOrgAiSettings('org-1', {
            supabase: supabase as unknown as GetOrgAiSettingsSupabase
        })

        expect(settings.hot_lead_handover_message_tr).toBe(DEFAULT_HANDOVER_MESSAGE_TR)
        expect(settings.hot_lead_handover_message_en).toBe(DEFAULT_HANDOVER_MESSAGE_EN)
    })

    it('returns Turkish default prompt for TR locale when stored prompt is EN default', async () => {
        const supabase = createSupabaseMock({
            bot_mode: 'active',
            match_threshold: 0.6,
            prompt: DEFAULT_FLEXIBLE_PROMPT,
            bot_name: 'Bot',
            allow_lead_extraction_during_operator: false,
            hot_lead_score_threshold: 7,
            hot_lead_action: 'notify_only',
            hot_lead_handover_message_tr: DEFAULT_HANDOVER_MESSAGE_TR,
            hot_lead_handover_message_en: DEFAULT_HANDOVER_MESSAGE_EN
        })

        const settings = await getOrgAiSettings('org-1', {
            supabase: supabase as unknown as GetOrgAiSettingsSupabase,
            locale: 'tr'
        })

        expect(settings.prompt).toBe(DEFAULT_FLEXIBLE_PROMPT_TR)
    })

    it('returns Turkish default prompt for TR locale when stored prompt is legacy EN default variant', async () => {
        const legacyPrompt = `You are the AI assistant for a business.
Be concise, friendly, and respond in the user's language.
Never invent prices, policies, services, or guarantees.
If you are unsure, ask a single clarifying question.
When generating fallback guidance, only use the provided list of topics.
If the user's message is a greeting or small talk, respond briefly and friendly, then ask how you can help.`

        const supabase = createSupabaseMock({
            bot_mode: 'active',
            match_threshold: 0.6,
            prompt: legacyPrompt,
            bot_name: 'Bot',
            allow_lead_extraction_during_operator: false,
            hot_lead_score_threshold: 7,
            hot_lead_action: 'notify_only',
            hot_lead_handover_message_tr: DEFAULT_HANDOVER_MESSAGE_TR,
            hot_lead_handover_message_en: DEFAULT_HANDOVER_MESSAGE_EN
        })

        const settings = await getOrgAiSettings('org-1', {
            supabase: supabase as unknown as GetOrgAiSettingsSupabase,
            locale: 'tr'
        })

        expect(settings.prompt).toBe(DEFAULT_FLEXIBLE_PROMPT_TR)
    })
})
