import { describe, expect, it, vi } from 'vitest'
import { getOrgAiSettings } from './settings'
import { DEFAULT_HANDOVER_MESSAGE_EN, DEFAULT_HANDOVER_MESSAGE_TR } from './escalation'
import {
    DEFAULT_ASSISTANT_INTAKE_RULE_EN,
    DEFAULT_ASSISTANT_INTAKE_RULE_TR,
    DEFAULT_ASSISTANT_NEVER_DO_EN,
    DEFAULT_ASSISTANT_NEVER_DO_TR,
    DEFAULT_ASSISTANT_OTHER_INSTRUCTIONS_EN,
    DEFAULT_ASSISTANT_OTHER_INSTRUCTIONS_TR,
    DEFAULT_ASSISTANT_ROLE_EN,
    DEFAULT_ASSISTANT_ROLE_TR,
    DEFAULT_FLEXIBLE_PROMPT
} from './prompts'
import {
    DEFAULT_BOT_DISCLAIMER_MESSAGE_EN,
    DEFAULT_BOT_DISCLAIMER_MESSAGE_TR
} from './bot-disclaimer'
import type { OrganizationOnboardingShellState } from '@/lib/onboarding/state'

type GetOrgAiSettingsSupabase = NonNullable<Parameters<typeof getOrgAiSettings>[1]>['supabase']

function createSupabaseMock(data: Record<string, unknown>, error: unknown = null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data, error })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })

    return { from, select, eq, maybeSingle }
}

describe('getOrgAiSettings handover message localization', () => {
    it('forces bot mode to off while onboarding is still incomplete even if legacy lock flag is false', async () => {
        const supabase = createSupabaseMock({
            bot_mode: 'shadow',
            bot_mode_unlock_required: false,
            bot_mode_unlocked_at: null,
            match_threshold: 0.6,
            prompt: DEFAULT_FLEXIBLE_PROMPT,
            bot_name: 'Bot',
            allow_lead_extraction_during_operator: false,
            hot_lead_score_threshold: 7,
            hot_lead_action: 'notify_only',
            hot_lead_handover_message_tr: DEFAULT_HANDOVER_MESSAGE_TR,
            hot_lead_handover_message_en: DEFAULT_HANDOVER_MESSAGE_EN
        })

        const onboardingState = {
            organizationId: 'org-1',
            isComplete: false,
            completedSteps: 4,
            totalSteps: 5,
            showBanner: true,
            showChecklistCta: true,
            showNavigationEntry: true,
            shouldAutoOpen: false,
            steps: []
        } satisfies OrganizationOnboardingShellState

        const settings = await getOrgAiSettings('org-1', {
            supabase: supabase as unknown as GetOrgAiSettingsSupabase,
            onboardingState
        })

        expect(settings.bot_mode).toBe('off')
        expect(settings.bot_mode_unlock_required).toBe(true)
    })

    it('forces bot mode to off for locked onboarding workspaces and exposes lock metadata', async () => {
        const supabase = createSupabaseMock({
            bot_mode: 'active',
            bot_mode_unlock_required: true,
            bot_mode_unlocked_at: null,
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
            supabase: supabase as unknown as GetOrgAiSettingsSupabase
        })

        expect(settings.bot_mode).toBe('off')
        expect(settings.bot_mode_unlock_required).toBe(true)
        expect(settings.bot_mode_unlocked_at).toBeNull()
    })

    it('falls back to unlocked behavior when onboarding lock columns are missing', async () => {
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
            supabase: supabase as unknown as GetOrgAiSettingsSupabase
        })

        expect(settings.bot_mode).toBe('active')
        expect(settings.bot_mode_unlock_required).toBe(false)
        expect(settings.bot_mode_unlocked_at).toBeNull()
    })

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

    it('returns Turkish starter assistant instructions for TR locale when structured fields are still untouched', async () => {
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

        expect(settings.assistant_role).toBe(DEFAULT_ASSISTANT_ROLE_TR)
        expect(settings.assistant_intake_rule).toBe(DEFAULT_ASSISTANT_INTAKE_RULE_TR)
        expect(settings.assistant_never_do).toBe(DEFAULT_ASSISTANT_NEVER_DO_TR)
        expect(settings.assistant_other_instructions).toBe(DEFAULT_ASSISTANT_OTHER_INSTRUCTIONS_TR)
        expect(settings.prompt).toContain(DEFAULT_ASSISTANT_NEVER_DO_TR)
    })

    it('returns English starter assistant instructions for EN locale when structured fields are still untouched', async () => {
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
            locale: 'en'
        })

        expect(settings.assistant_role).toBe(DEFAULT_ASSISTANT_ROLE_EN)
        expect(settings.assistant_intake_rule).toBe(DEFAULT_ASSISTANT_INTAKE_RULE_EN)
        expect(settings.assistant_never_do).toBe(DEFAULT_ASSISTANT_NEVER_DO_EN)
        expect(settings.assistant_other_instructions).toBe(DEFAULT_ASSISTANT_OTHER_INSTRUCTIONS_EN)
    })

    it('carries a legacy custom prompt into assistant_other_instructions before the workspace saves the new model', async () => {
        const legacyPrompt = 'Before giving any price, first learn which service the customer wants.'

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

        expect(settings.assistant_role).toBe('')
        expect(settings.assistant_intake_rule).toBe('')
        expect(settings.assistant_never_do).toBe('')
        expect(settings.assistant_other_instructions).toBe(legacyPrompt)
        expect(settings.prompt).toBe(legacyPrompt)
    })

    it('compiles structured assistant instructions into the compatibility prompt in hard-soft order and skips empty sections', async () => {
        const supabase = createSupabaseMock({
            bot_mode: 'active',
            match_threshold: 0.6,
            prompt: DEFAULT_FLEXIBLE_PROMPT,
            assistant_role: 'Önce ihtiyacı anla ve kısa cevap ver.',
            assistant_intake_rule: 'Kritik bilgi eksikse önce tek soru sor.',
            assistant_never_do: 'Fiyat uydurma.',
            assistant_other_instructions: '',
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

        expect(settings.prompt).toContain('Fiyat uydurma.')
        expect(settings.prompt).toContain('Önce ihtiyacı anla ve kısa cevap ver.')
        expect(settings.prompt).toContain('Kritik bilgi eksikse önce tek soru sor.')
        expect(settings.prompt).not.toContain('Diğer talimatlar')
        expect(settings.prompt.indexOf('Fiyat uydurma.')).toBeLessThan(
            settings.prompt.indexOf('Önce ihtiyacı anla ve kısa cevap ver.')
        )
        expect(settings.prompt.indexOf('Önce ihtiyacı anla ve kısa cevap ver.')).toBeLessThan(
            settings.prompt.indexOf('Kritik bilgi eksikse önce tek soru sor.')
        )
    })

    it('defaults bot disclaimer settings when columns are missing', async () => {
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
            supabase: supabase as unknown as GetOrgAiSettingsSupabase
        })

        expect(settings.bot_disclaimer_enabled).toBe(true)
        expect(settings.bot_disclaimer_message_tr).toBe(DEFAULT_BOT_DISCLAIMER_MESSAGE_TR)
        expect(settings.bot_disclaimer_message_en).toBe(DEFAULT_BOT_DISCLAIMER_MESSAGE_EN)
    })
})
