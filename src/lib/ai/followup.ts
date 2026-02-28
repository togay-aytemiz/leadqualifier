import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai/usage'
import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { normalizeIntakeFields } from '@/lib/leads/offering-profile-utils'
import { resolveCollectedRequiredIntake } from '@/lib/leads/required-intake'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

interface RequiredIntakeFollowupPayload {
    missingFields: string[]
    followupQuestion: string | null
}

export type LiveRequestMode = 'lead_qualification' | 'general_information' | 'policy_or_procedure'
const COMBINING_MARKS = /[\u0300-\u036f]/g
const FIELD_TOKEN_STOPWORDS = new Set([
    've',
    'ile',
    'icin',
    'için',
    'bilgi',
    'detay',
    'alan',
    'field',
    'required',
    'zorunlu',
    'lütfen',
    'lutfen',
    'please',
    'the',
    'for',
    'of',
    'to',
    'your',
    'hangi',
    'nedir',
    'what',
    'which'
])
const FIELD_PRIORITY_RULES: Array<{ pattern: RegExp, weight: number }> = [
    { pattern: /\b(hizmet|service|paket|package|urun|ürün|problem|konu|talep|ihtiyac)\b/i, weight: 120 },
    { pattern: /\b(tarih|date|zaman|time|saat|day|gun|gün|availability|uygunluk)\b/i, weight: 110 },
    { pattern: /\b(ad|isim|name|telefon|phone|mail|email|e-posta|eposta|contact)\b/i, weight: 105 },
    { pattern: /\b(butce|bütçe|ucret|ücret|fiyat|price|payment|odeme|ödeme)\b/i, weight: 95 },
    { pattern: /\b(konum|adres|lokasyon|location|sehir|şehir|ilce|ilçe|city)\b/i, weight: 85 },
    { pattern: /\b(aciliyet|urgency|priority|öncelik|oncelik)\b/i, weight: 80 }
]

export interface FollowupLeadSnapshot {
    service_type?: string | null
    extracted_fields?: Record<string, unknown> | null
}

export interface RequiredIntakeStateAnalysis {
    requestMode: LiveRequestMode
    requiredFields: string[]
    effectiveRequiredFields: string[]
    collectedFields: string[]
    blockedReaskFields: string[]
    missingFields: string[]
    dynamicMinimumCount: number
    isShortConversation: boolean
    latestRefusal: boolean
    noProgressStreak: boolean
    suppressIntakeQuestions: boolean
}

interface AnalyzeRequiredIntakeStateInput {
    requiredFields: string[]
    recentCustomerMessages: string[]
    recentAssistantMessages?: string[]
    leadSnapshot?: FollowupLeadSnapshot | null
}

interface BuildRequiredIntakeFollowupGuidanceOptions {
    analysis?: RequiredIntakeStateAnalysis
    leadSnapshot?: FollowupLeadSnapshot | null
}

const POLICY_OR_PROCEDURE_PATTERNS = [
    /\biptal\b/i,
    /\biade\b/i,
    /\bgizlilik\b/i,
    /\bkvkk\b/i,
    /\bprosed[uü]r\b/i,
    /\bpolicy\b/i,
    /\bprivacy\b/i,
    /\bcancel(?:lation)?\b/i,
    /\brefund\b/i
]

const GENERAL_INFORMATION_PATTERNS = [
    /\bgenel bilgi\b/i,
    /\bhakk[ıi]nda bilgi\b/i,
    /\bnas[ıi]l çal[ıi][sş][ıi]r\b/i,
    /\bwhat is\b/i,
    /\bhow does\b/i,
    /\binformation\b/i,
    /\bdetails\b/i
]

const LEAD_QUALIFICATION_PATTERNS = [
    /\bfiyat\b/i,
    /\bücret\b/i,
    /\bb[uü]t[cç]e\b/i,
    /\brandevu\b/i,
    /\bteklif\b/i,
    /\bpaket\b/i,
    /\buygunluk\b/i,
    /\bne zaman\b/i,
    /\bbook\b/i,
    /\bquote\b/i,
    /\bpricing\b/i,
    /\bavailability\b/i,
    /\bschedule\b/i,
    /\bstart\b/i
]

const REFUSAL_PATTERNS = [
    /payla[sş](mak)? istemiyorum/i,
    /detay vermek istemiyorum/i,
    /sormay[iı]n/i,
    /i (?:do not|don't) want to share/i,
    /rather not share/i
]

const NO_PROGRESS_PATTERNS = [
    /bilmiyorum/i,
    /emin de[gğ]ilim/i,
    /[sş]imdilik/i,
    /later/i,
    /not sure/i
]

function detectLiveRequestMode(message: string): LiveRequestMode {
    const normalized = message.trim()
    if (!normalized) return 'lead_qualification'
    if (POLICY_OR_PROCEDURE_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return 'policy_or_procedure'
    }
    if (LEAD_QUALIFICATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return 'lead_qualification'
    }
    if (GENERAL_INFORMATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return 'general_information'
    }
    return 'lead_qualification'
}

function hasRefusalSignal(message: string) {
    return REFUSAL_PATTERNS.some((pattern) => pattern.test(message))
}

function hasNoProgressSignal(message: string) {
    return NO_PROGRESS_PATTERNS.some((pattern) => pattern.test(message))
}

function normalizeForFieldMatch(value: string) {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')
        .toLowerCase()
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tokenizeFieldLabel(field: string) {
    return normalizeForFieldMatch(field)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !FIELD_TOKEN_STOPWORDS.has(token))
}

function messageMentionsField(field: string, message: string) {
    const normalizedMessage = normalizeForFieldMatch(message)
    if (!normalizedMessage) return false

    const tokens = tokenizeFieldLabel(field)
    if (tokens.length === 0) return false

    let tokenHits = 0
    let hasStrongTokenHit = false
    for (const token of tokens) {
        const matched = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i').test(normalizedMessage)
            || normalizedMessage.includes(token)
        if (!matched) continue
        tokenHits += 1
        if (token.length >= 4) hasStrongTokenHit = true
    }
    if (tokens.length === 1) return tokenHits >= 1
    if (tokenHits >= Math.min(2, tokens.length)) return true
    return hasStrongTokenHit && tokenHits >= 1
}

function resolveDynamicMinimumRequiredFieldCount(totalFields: number, customerTurnCount: number) {
    if (totalFields <= 2) return totalFields
    if (customerTurnCount <= 3) return Math.min(2, totalFields)
    if (customerTurnCount <= 5) return Math.min(3, totalFields)
    return Math.min(4, totalFields)
}

function resolveFieldPriorityWeight(field: string, latestMessage: string) {
    let weight = 10

    for (const rule of FIELD_PRIORITY_RULES) {
        if (rule.pattern.test(field)) {
            weight = Math.max(weight, rule.weight)
        }
    }
    if (latestMessage && messageMentionsField(field, latestMessage)) {
        weight += 15
    }
    return weight
}

function resolvePrioritizedRequiredFields(requiredFields: string[], latestMessage: string) {
    return requiredFields
        .map((field, index) => ({
            field,
            index,
            weight: resolveFieldPriorityWeight(field, latestMessage)
        }))
        .sort((a, b) => {
            if (b.weight !== a.weight) return b.weight - a.weight
            return a.index - b.index
        })
        .map((item) => item.field)
}

function resolveCollectedFieldsFromLeadSnapshot(
    requiredFields: string[],
    leadSnapshot?: FollowupLeadSnapshot | null
) {
    const collected = resolveCollectedRequiredIntake({
        requiredFields,
        serviceType: leadSnapshot?.service_type ?? null,
        extractedFields: leadSnapshot?.extracted_fields ?? null
    }).map((item) => item.field)

    return normalizeIntakeFields(collected)
}

function resolveBlockedReaskFields(input: {
    requiredFields: string[]
    recentCustomerMessages: string[]
    recentAssistantMessages: string[]
    collectedFieldKeys: Set<string>
    noProgressStreak: boolean
}) {
    const blocked = new Set<string>()
    const refusalMessages = input.recentCustomerMessages.filter((message) => hasRefusalSignal(message))
    const assistantQuestionMessages = input.recentAssistantMessages
        .filter((message) => message.includes('?'))
        .slice(-3)

    for (const field of input.requiredFields) {
        const fieldKey = normalizeFieldKey(field)
        if (!fieldKey) continue
        if (input.collectedFieldKeys.has(fieldKey)) {
            blocked.add(fieldKey)
            continue
        }

        if (refusalMessages.some((message) => messageMentionsField(field, message))) {
            blocked.add(fieldKey)
            continue
        }

        if (
            input.noProgressStreak
            && assistantQuestionMessages.some((message) => messageMentionsField(field, message))
        ) {
            blocked.add(fieldKey)
        }
    }

    return blocked
}

export function analyzeRequiredIntakeState(
    options: AnalyzeRequiredIntakeStateInput
): RequiredIntakeStateAnalysis {
    const requiredFields = normalizeIntakeFields(options.requiredFields ?? [])
    if (requiredFields.length === 0) {
        return {
            requestMode: 'lead_qualification',
            requiredFields: [],
            effectiveRequiredFields: [],
            collectedFields: [],
            blockedReaskFields: [],
            missingFields: [],
            dynamicMinimumCount: 0,
            isShortConversation: true,
            latestRefusal: false,
            noProgressStreak: false,
            suppressIntakeQuestions: false
        }
    }

    const customerMessages = (options.recentCustomerMessages ?? [])
        .map((message) => message.trim())
        .filter(Boolean)
        .slice(-8)
    const assistantMessages = (options.recentAssistantMessages ?? [])
        .map((message) => message.trim())
        .filter(Boolean)
        .slice(-3)
    const latestCustomerMessage = customerMessages[customerMessages.length - 1] ?? ''
    const requestMode = detectLiveRequestMode(latestCustomerMessage)
    const latestRefusal = latestCustomerMessage ? hasRefusalSignal(latestCustomerMessage) : false
    const lastTwoCustomerMessages = customerMessages.slice(-2)
    const noProgressStreak = lastTwoCustomerMessages.length >= 2
        && lastTwoCustomerMessages.every((message) => hasRefusalSignal(message) || hasNoProgressSignal(message))

    const collectedFields = resolveCollectedFieldsFromLeadSnapshot(requiredFields, options.leadSnapshot)
    const collectedFieldKeys = new Set(collectedFields.map((field) => normalizeFieldKey(field)))
    const blockedFieldKeys = resolveBlockedReaskFields({
        requiredFields,
        recentCustomerMessages: customerMessages,
        recentAssistantMessages: assistantMessages,
        collectedFieldKeys,
        noProgressStreak
    })
    const prioritizedFields = resolvePrioritizedRequiredFields(requiredFields, latestCustomerMessage)
    const dynamicMinimumCount = resolveDynamicMinimumRequiredFieldCount(
        prioritizedFields.length,
        customerMessages.length
    )
    const effectiveRequiredFields = prioritizedFields.slice(0, dynamicMinimumCount)
    const blockedReaskFields = requiredFields.filter((field) => blockedFieldKeys.has(normalizeFieldKey(field)))
    const missingFields = effectiveRequiredFields.filter((field) => {
        const key = normalizeFieldKey(field)
        return !blockedFieldKeys.has(key) && !collectedFieldKeys.has(key)
    })
    const suppressIntakeQuestions = requestMode !== 'lead_qualification'
        || latestRefusal
        || (noProgressStreak && blockedReaskFields.length > 0)

    return {
        requestMode,
        requiredFields,
        effectiveRequiredFields,
        collectedFields,
        blockedReaskFields,
        missingFields,
        dynamicMinimumCount,
        isShortConversation: customerMessages.length <= 3,
        latestRefusal,
        noProgressStreak,
        suppressIntakeQuestions
    }
}

export async function getRequiredIntakeFields(options: {
    organizationId: string
    supabase?: SupabaseClientLike
}) {
    const supabase = options.supabase ?? await createClient()
    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('required_intake_fields')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    return normalizeIntakeFields(profile?.required_intake_fields ?? [])
}

export function buildRequiredIntakeFollowupGuidance(
    requiredFields: string[],
    recentCustomerMessages: string[],
    recentAssistantMessages: string[] = [],
    options?: BuildRequiredIntakeFollowupGuidanceOptions
) {
    const analysis = options?.analysis ?? analyzeRequiredIntakeState({
        requiredFields,
        recentCustomerMessages,
        recentAssistantMessages,
        leadSnapshot: options?.leadSnapshot ?? null
    })
    if (analysis.requiredFields.length === 0) return null

    const normalizedMessages = recentCustomerMessages
        .map((message) => message.trim())
        .filter(Boolean)
        .slice(-8)
    const normalizedAssistantMessages = recentAssistantMessages
        .map((message) => message.trim())
        .filter(Boolean)
        .slice(-3)

    const fieldsBlock = analysis.requiredFields.map((field) => `- ${field}`).join('\n')
    const effectiveBlock = analysis.effectiveRequiredFields.length > 0
        ? analysis.effectiveRequiredFields.map((field) => `- ${field}`).join('\n')
        : 'none'
    const collectedBlock = analysis.collectedFields.length > 0
        ? analysis.collectedFields.map((field) => `- ${field}`).join('\n')
        : 'none'
    const blockedBlock = analysis.blockedReaskFields.length > 0
        ? analysis.blockedReaskFields.map((field) => `- ${field}`).join('\n')
        : 'none'
    const missingBlock = analysis.missingFields.length > 0
        ? analysis.missingFields.map((field) => `- ${field}`).join('\n')
        : 'none'
    const messagesBlock = normalizedMessages.length > 0
        ? normalizedMessages.map((message, index) => `${index + 1}. ${message}`).join('\n')
        : 'none'
    const assistantBlock = normalizedAssistantMessages.length > 0
        ? normalizedAssistantMessages.map((message, index) => `${index + 1}. ${message}`).join('\n')
        : 'none'

    if (analysis.requestMode !== 'lead_qualification') {
        const modeLabel = analysis.requestMode === 'policy_or_procedure'
            ? 'policy/procedure'
            : 'general information'
        return `Lead qualification context:
Required intake fields:
${fieldsBlock}

Dynamic minimum scope (this conversation):
${effectiveBlock}

Already collected required fields:
${collectedBlock}

Blocked re-ask fields:
${blockedBlock}

Recent customer messages:
${messagesBlock}

Recent assistant replies:
${assistantBlock}

Current request mode: ${modeLabel}.
Do NOT force lead-intake collection questions in this turn.
Answer the user request directly and keep followup_question null unless user explicitly asks for booking/quote/pricing qualification next step.`
    }

    const extraGuardLines: string[] = []
    if (analysis.latestRefusal) {
        extraGuardLines.push('User explicitly refused sharing details in the latest turn: do not insist and avoid intake-style follow-up question in this turn.')
    }
    if (analysis.noProgressStreak) {
        extraGuardLines.push('No-progress guard: if the last two customer turns show refusal/uncertainty, do not insist or repeat the same intake ask; prefer concise status + optional next step.')
    }
    if (analysis.blockedReaskFields.length > 0) {
        extraGuardLines.push('Blocked re-ask fields must not be requested again in this turn.')
    }
    if (analysis.isShortConversation) {
        extraGuardLines.push('Short-conversation mode: keep intake scope minimal and prioritize only the most impactful missing field.')
    }
    if (analysis.suppressIntakeQuestions) {
        extraGuardLines.push('Intake suppression is active for this turn: do not append a new intake follow-up question.')
    }
    const extraGuardsBlock = extraGuardLines.length > 0
        ? `\n\nGuardrails:\n${extraGuardLines.map((line) => `- ${line}`).join('\n')}`
        : ''

    return `Lead qualification context:
Required intake fields:
${fieldsBlock}

Dynamic minimum scope (this conversation):
${effectiveBlock}

Already collected required fields:
${collectedBlock}

Blocked re-ask fields:
${blockedBlock}

Still-missing fields in scope:
${missingBlock}

Recent customer messages:
${messagesBlock}

Recent assistant replies:
${assistantBlock}

If important required intake fields are still missing, include one concise and natural follow-up question in the same language as the customer.
Choose the most important missing 1 field to ask now.
Ask only from "Still-missing fields in scope" and never ask from "Blocked re-ask fields" or "Already collected required fields".
Avoid repeating greeting/opening phrases if recent assistant replies already included them.
If all required fields are already provided, do not add a follow-up question.${extraGuardsBlock}`
}

const REQUIRED_INTAKE_FOLLOWUP_SYSTEM_PROMPT = `You help qualify inbound leads for a business.
Given required intake fields and recent customer messages, decide which required fields are still missing.
Only mark a field as missing if customer messages do not clearly provide it.
If at least one field is missing, write one concise, polite follow-up question in the customer's language.
Ask only for the most important 1-2 missing fields in one sentence.
If no fields are missing, set followup_question to null.
Return ONLY JSON in this format:
{ "missing_fields": string[], "followup_question": string | null }`

function normalizeFieldKey(value: string) {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')
        .toLowerCase()
}

function stripJsonFence(value: string) {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    return fenced?.[1]?.trim() ?? value
}

function extractFencedBlocks(value: string) {
    const blocks: string[] = []
    const pattern = /```(?:json)?\s*([\s\S]*?)\s*```/gi
    let match: RegExpExecArray | null = pattern.exec(value)
    while (match) {
        const captured = match[1]?.trim()
        if (captured) blocks.push(captured)
        match = pattern.exec(value)
    }
    return blocks
}

function extractFirstJsonObject(value: string) {
    const text = value.trim()
    if (!text) return null
    if (text.startsWith('{') && text.endsWith('}')) return text

    let startIndex = -1
    let depth = 0

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i]
        if (char === '{') {
            if (depth === 0) startIndex = i
            depth += 1
            continue
        }
        if (char === '}' && depth > 0) {
            depth -= 1
            if (depth === 0 && startIndex !== -1) {
                return text.slice(startIndex, i + 1)
            }
        }
    }

    return null
}

function parseJsonCandidate(value: string) {
    try {
        return JSON.parse(value)
    } catch {
        return null
    }
}

export function parseRequiredIntakeFollowupPayload(raw: string): RequiredIntakeFollowupPayload | null {
    const trimmed = raw.trim()
    if (!trimmed) return null

    const stripped = stripJsonFence(trimmed)
    const candidates = [
        trimmed,
        stripped,
        ...extractFencedBlocks(trimmed),
        extractFirstJsonObject(stripped)
    ].filter((item): item is string => Boolean(item))

    const seen = new Set<string>()

    for (const candidate of candidates) {
        if (seen.has(candidate)) continue
        seen.add(candidate)

        const parsed = parseJsonCandidate(candidate)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue

        const parsedObject = parsed as Record<string, unknown>
        const rawMissing = parsedObject.missing_fields ?? parsedObject.missingFields
        const rawFollowup = parsedObject.followup_question ?? parsedObject.followupQuestion
        const missingFields = Array.isArray(rawMissing)
            ? normalizeIntakeFields(rawMissing.filter((item): item is string => typeof item === 'string'))
            : []
        const followupQuestion = typeof rawFollowup === 'string' && rawFollowup.trim().length > 0
            ? rawFollowup.trim()
            : null

        return { missingFields, followupQuestion }
    }

    return null
}

export function appendFollowupQuestion(reply: string, followup?: string | null) {
    const trimmed = followup?.trim()
    if (!trimmed) return reply
    return `${reply}\n\n${trimmed}`
}

export async function generateRequiredIntakeFollowup(options: {
    organizationId: string
    conversationId?: string
    recentCustomerMessages?: string[]
    latestUserMessage?: string
    source?: 'telegram' | 'simulator' | 'whatsapp' | 'unknown'
    trackUsage?: boolean
    supabase?: SupabaseClientLike
    maxMessages?: number
}): Promise<RequiredIntakeFollowupPayload> {
    const supabase = options.supabase ?? await createClient()
    const maxMessages = Math.max(3, Math.min(options.maxMessages ?? 8, 12))

    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('required_intake_fields')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    const requiredFields = normalizeIntakeFields(profile?.required_intake_fields ?? [])
    if (requiredFields.length === 0) {
        return { missingFields: [], followupQuestion: null }
    }

    if (!process.env.OPENAI_API_KEY) {
        return { missingFields: [], followupQuestion: null }
    }

    const entitlement = await resolveOrganizationUsageEntitlement(options.organizationId, { supabase })
    if (!entitlement.isUsageAllowed) {
        return { missingFields: [], followupQuestion: null }
    }

    const providedMessages = (options.recentCustomerMessages ?? [])
        .map((item) => item.trim())
        .filter(Boolean)

    const messages: string[] = providedMessages.length > 0
        ? providedMessages
        : options.conversationId
            ? ((await supabase
                .from('messages')
                .select('content, created_at')
                .eq('conversation_id', options.conversationId)
                .eq('sender_type', 'contact')
                .order('created_at', { ascending: false })
                .limit(maxMessages)).data ?? [])
                .slice()
                .reverse()
                .map((item: { content?: string | null }) => (item.content ?? '').toString().trim())
                .filter(Boolean)
            : []

    const latestMessage = (options.latestUserMessage ?? '').trim()
    if (latestMessage && !messages.some((item: string) => item === latestMessage)) {
        messages.push(latestMessage)
    }

    if (messages.length === 0) {
        return { missingFields: [], followupQuestion: null }
    }

    const requiredFieldList = requiredFields.map((field) => `- ${field}`).join('\n')
    const conversationList = messages.map((message, index) => `${index + 1}. ${message}`).join('\n')
    const userPrompt = `Required intake fields:\n${requiredFieldList}\n\nRecent customer messages:\n${conversationList}`

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: REQUIRED_INTAKE_FOLLOWUP_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
        ]
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) {
        return { missingFields: [], followupQuestion: null }
    }

    if (options.trackUsage !== false) {
        const usage = completion.usage
        if (usage) {
            await recordAiUsage({
                organizationId: options.organizationId,
                category: 'lead_extraction',
                model: 'gpt-4o-mini',
                inputTokens: usage.prompt_tokens ?? 0,
                outputTokens: usage.completion_tokens ?? 0,
                totalTokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
                metadata: {
                    source: 'required_intake_followup',
                    channel: options.source ?? 'unknown',
                    conversation_id: options.conversationId ?? null
                },
                supabase
            })
        } else {
            const inputTokens = estimateTokenCount(REQUIRED_INTAKE_FOLLOWUP_SYSTEM_PROMPT) + estimateTokenCount(userPrompt)
            const outputTokens = estimateTokenCount(response)
            await recordAiUsage({
                organizationId: options.organizationId,
                category: 'lead_extraction',
                model: 'gpt-4o-mini',
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                metadata: {
                    source: 'required_intake_followup',
                    channel: options.source ?? 'unknown',
                    conversation_id: options.conversationId ?? null
                },
                supabase
            })
        }
    }

    const parsed = parseRequiredIntakeFollowupPayload(response)
    if (!parsed) {
        return { missingFields: [], followupQuestion: null }
    }

    const requiredMap = new Map<string, string>()
    for (const field of requiredFields) {
        requiredMap.set(normalizeFieldKey(field), field)
    }

    const missingFields = normalizeIntakeFields(
        parsed.missingFields
            .map((field) => requiredMap.get(normalizeFieldKey(field)))
            .filter((field): field is string => Boolean(field))
    )

    if (missingFields.length === 0) {
        return { missingFields: [], followupQuestion: null }
    }

    return {
        missingFields,
        followupQuestion: parsed.followupQuestion
    }
}
