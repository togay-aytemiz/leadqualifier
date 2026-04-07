import type { OrganizationAiSettings } from '@/types/database'
import {
    DEFAULT_ASSISTANT_INTAKE_RULE_EN,
    DEFAULT_ASSISTANT_INTAKE_RULE_TR,
    DEFAULT_ASSISTANT_NEVER_DO_EN,
    DEFAULT_ASSISTANT_NEVER_DO_TR,
    DEFAULT_ASSISTANT_OTHER_INSTRUCTIONS_EN,
    DEFAULT_ASSISTANT_OTHER_INSTRUCTIONS_TR,
    DEFAULT_ASSISTANT_ROLE_EN,
    DEFAULT_ASSISTANT_ROLE_TR,
    DEFAULT_FLEXIBLE_PROMPT,
    DEFAULT_FLEXIBLE_PROMPT_TR,
    DEFAULT_STRICT_FALLBACK_TEXT,
    DEFAULT_STRICT_FALLBACK_TEXT_EN
} from '@/lib/ai/prompts'

type AssistantInstructionFields = Pick<
    OrganizationAiSettings,
    'assistant_role' | 'assistant_intake_rule' | 'assistant_never_do' | 'assistant_other_instructions'
>

const LEGACY_EN_DEFAULT_PROMPTS = new Set([
    DEFAULT_STRICT_FALLBACK_TEXT_EN,
    DEFAULT_FLEXIBLE_PROMPT
])

const LEGACY_TR_DEFAULT_PROMPTS = new Set([
    DEFAULT_STRICT_FALLBACK_TEXT,
    DEFAULT_FLEXIBLE_PROMPT_TR
])

function isTurkishLocale(locale: string | null | undefined) {
    return (locale ?? '').toString().toLowerCase().startsWith('tr')
}

function normalizeInstructionField(value: string | null | undefined) {
    if (typeof value !== 'string') return ''
    return value.trim()
}

function normalizePromptValue(value: string | null | undefined) {
    if (typeof value !== 'string') return ''
    return value.trim()
}

function getInstructionLabels(locale: string | null | undefined) {
    if (isTurkishLocale(locale)) {
        return {
            intro: 'İşletmeye özel yapay zeka asistan talimatları:',
            assistantNeverDo: 'Asla yapma:',
            assistantRole: 'Asistanın görevi:',
            assistantIntakeRule: 'Eksik bilgi toplama kuralı:',
            assistantOtherInstructions: 'Diğer talimatlar:'
        }
    }

    return {
        intro: 'Business-specific AI assistant instructions:',
        assistantNeverDo: 'Never do this:',
        assistantRole: 'Assistant role:',
        assistantIntakeRule: 'Missing-information rule:',
        assistantOtherInstructions: 'Other instructions:'
    }
}

export function getDefaultAssistantInstructions(locale: string | null | undefined): AssistantInstructionFields {
    if (isTurkishLocale(locale)) {
        return {
            assistant_role: DEFAULT_ASSISTANT_ROLE_TR,
            assistant_intake_rule: DEFAULT_ASSISTANT_INTAKE_RULE_TR,
            assistant_never_do: DEFAULT_ASSISTANT_NEVER_DO_TR,
            assistant_other_instructions: DEFAULT_ASSISTANT_OTHER_INSTRUCTIONS_TR
        }
    }

    return {
        assistant_role: DEFAULT_ASSISTANT_ROLE_EN,
        assistant_intake_rule: DEFAULT_ASSISTANT_INTAKE_RULE_EN,
        assistant_never_do: DEFAULT_ASSISTANT_NEVER_DO_EN,
        assistant_other_instructions: DEFAULT_ASSISTANT_OTHER_INSTRUCTIONS_EN
    }
}

export function compileAssistantInstructions(
    fields: AssistantInstructionFields,
    locale: string | null | undefined
) {
    const basePrompt = isTurkishLocale(locale)
        ? DEFAULT_FLEXIBLE_PROMPT_TR
        : DEFAULT_FLEXIBLE_PROMPT
    const labels = getInstructionLabels(locale)
    const sections = [
        fields.assistant_never_do
            ? `${labels.assistantNeverDo}\n${fields.assistant_never_do}`
            : '',
        fields.assistant_role
            ? `${labels.assistantRole}\n${fields.assistant_role}`
            : '',
        fields.assistant_intake_rule
            ? `${labels.assistantIntakeRule}\n${fields.assistant_intake_rule}`
            : '',
        fields.assistant_other_instructions
            ? `${labels.assistantOtherInstructions}\n${fields.assistant_other_instructions}`
            : ''
    ].filter(Boolean)

    if (sections.length === 0) {
        return basePrompt
    }

    return `${basePrompt}\n\n${labels.intro}\n\n${sections.join('\n\n')}`
}

export function hasStructuredAssistantInstructionState(
    settings: Partial<OrganizationAiSettings> | null | undefined
) {
    return [
        settings?.assistant_role,
        settings?.assistant_intake_rule,
        settings?.assistant_never_do,
        settings?.assistant_other_instructions
    ].some((value) => typeof value === 'string')
}

function isKnownDefaultPrompt(prompt: string) {
    return LEGACY_EN_DEFAULT_PROMPTS.has(prompt) || LEGACY_TR_DEFAULT_PROMPTS.has(prompt)
}

function isKnownDefaultInstructionFields(fields: AssistantInstructionFields) {
    const enDefaults = getDefaultAssistantInstructions('en')
    const trDefaults = getDefaultAssistantInstructions('tr')

    return [enDefaults, trDefaults].some((defaults) => (
        fields.assistant_role === defaults.assistant_role &&
        fields.assistant_intake_rule === defaults.assistant_intake_rule &&
        fields.assistant_never_do === defaults.assistant_never_do &&
        fields.assistant_other_instructions === defaults.assistant_other_instructions
    ))
}

export function resolveStructuredAssistantInstructions(
    settings: Partial<OrganizationAiSettings> | null | undefined,
    locale: string | null | undefined
) {
    if (hasStructuredAssistantInstructionState(settings)) {
        const normalizedFields = {
            assistant_role: normalizeInstructionField(settings?.assistant_role),
            assistant_intake_rule: normalizeInstructionField(settings?.assistant_intake_rule),
            assistant_never_do: normalizeInstructionField(settings?.assistant_never_do),
            assistant_other_instructions: normalizeInstructionField(settings?.assistant_other_instructions)
        }

        if (isKnownDefaultInstructionFields(normalizedFields)) {
            const defaultFields = getDefaultAssistantInstructions(locale)
            return {
                ...defaultFields,
                prompt: compileAssistantInstructions(defaultFields, locale)
            }
        }

        return {
            ...normalizedFields,
            prompt: compileAssistantInstructions(normalizedFields, locale)
        }
    }

    const legacyPrompt = normalizePromptValue(settings?.prompt)
    if (legacyPrompt && !isKnownDefaultPrompt(legacyPrompt)) {
        return {
            assistant_role: '',
            assistant_intake_rule: '',
            assistant_never_do: '',
            assistant_other_instructions: legacyPrompt,
            prompt: legacyPrompt
        }
    }

    const defaultFields = getDefaultAssistantInstructions(locale)
    return {
        ...defaultFields,
        prompt: compileAssistantInstructions(defaultFields, locale)
    }
}
