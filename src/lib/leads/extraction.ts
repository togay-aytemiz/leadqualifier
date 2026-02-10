import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { normalizeIntakeFields } from '@/lib/leads/offering-profile-utils'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

const TURKISH_CHAR_PATTERN = /[ığüşöçİĞÜŞÖÇ]/
const TURKISH_WORD_PATTERN = /\b(merhaba|selam|fiyat|randevu|teşekkür|lütfen|yarın|bugün|müsait|kampanya|hizmet|çekim|cekim|vazgeçtim|vazgectim)\b/i
const ENGLISH_WORD_PATTERN = /\b(hello|hi|price|appointment|thank(s| you)|please|tomorrow|today|available|campaign|service|book|booking|schedule)\b/i
const GENERIC_GREETING_PATTERN = /^(?:hi|hello|hey|selam|merhaba|slm|tesekkurler|teşekkürler|thanks|thank you|ok|tamam|👍|👌|👋|🙏)[.!?\s]*$/i
const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g
const LEAD_EXTRACTION_MAX_OUTPUT_TOKENS = 320
const LEAD_EXTRACTION_MAX_CONTEXT_TURNS = 10
const LEAD_EXTRACTION_MAX_MESSAGES_TO_LOAD = 20
const LEAD_EXTRACTION_MAX_CUSTOMER_MESSAGES = 5

function isLikelyTurkishText(value: string) {
    const text = (value ?? '').trim()
    if (!text) return false
    if (TURKISH_CHAR_PATTERN.test(text)) return true
    return TURKISH_WORD_PATTERN.test(text)
}

function isLikelyEnglishText(value: string) {
    const text = (value ?? '').trim()
    if (!text) return false
    if (TURKISH_CHAR_PATTERN.test(text)) return false
    return ENGLISH_WORD_PATTERN.test(text)
}

export function resolveLeadExtractionLocale(options?: {
    preferredLocale?: string | null
    organizationLocale?: string | null
    customerMessages?: string[]
    latestMessage?: string | null
}) {
    const preferredLocale = (options?.preferredLocale ?? '').toString().trim().toLowerCase()
    if (preferredLocale.startsWith('tr')) return 'tr' as const
    if (preferredLocale.startsWith('en')) return 'en' as const

    const organizationLocale = (options?.organizationLocale ?? '').toString().trim().toLowerCase()
    if (organizationLocale.startsWith('tr')) return 'tr' as const
    if (organizationLocale.startsWith('en')) return 'en' as const

    const samples = [
        ...(options?.customerMessages ?? []),
        options?.latestMessage ?? ''
    ]
        .map((item) => item.trim())
        .filter(Boolean)

    if (samples.length === 0) {
        return 'tr' as const
    }

    let turkishScore = 0
    let englishScore = 0

    for (const sample of samples) {
        if (isLikelyTurkishText(sample)) turkishScore += 1
        if (isLikelyEnglishText(sample)) englishScore += 1
    }

    if (turkishScore > englishScore) return 'tr' as const
    if (englishScore > turkishScore) return 'en' as const
    return turkishScore > 0 ? 'tr' as const : 'en' as const
}

function buildExtractionSystemPrompt(responseLanguage: 'Turkish' | 'English') {
    return `Extract lead signals as JSON.
Return ONLY valid JSON (no code fences, no extra text).
Return keys: service_type, desired_date, location, budget_signals, intent_signals, risk_signals, non_business, summary, score, status, required_intake_collected.
intent_signals can include: decisive (explicit booking/appointment intent), urgent (ASAP/today/tomorrow), indecisive (unsure), far_future (months later/next season).
Recent conversation turns are labeled as one of: customer, owner, assistant.
Customer messages are labeled "customer:" and represent the latest 5 customer messages.
Prioritize customer intent and the most recent customer messages.
Use owner/assistant turns only as context to interpret short customer confirmations (for example: "yes", "evet", "correct").
Do not treat owner/assistant statements as customer facts unless the customer clearly confirms.
Do not infer service_type solely from assistant replies; require customer confirmation.
If the customer negates a service (e.g., "X istemiyorum"), do not output that service.
If customer messages are only greeting/acknowledgement and contain no service clue, service_type must be null.
Score must be an integer from 0 to 10.
Status must be one of: hot, warm, cold, ignored, undetermined.
Use status=undetermined when customer information is not enough to qualify intent (for example only greeting/acknowledgement or short unclear turns).
If non_business is true, set score to 0 and status to ignored.
Use catalog names when possible for service_type.
If catalog is empty, infer service_type from offering profile summary/suggestions only when customer messages include a service clue.
If service_type matches a provided catalog name, keep that catalog name exactly as-is.
If no catalog match exists, write inferred service_type in ${responseLanguage}.
When required intake fields are provided, fill required_intake_collected as an object that maps clearly collected field names to concise values.
Only include fields clearly provided by the customer; otherwise omit them from the object.
If none are collected, return required_intake_collected as {}.
Messages indicating cancellation/decline (e.g., "vazgeçtim", "istemiyorum") are still business-context messages, not personal/social chat.
Use nulls if unknown. Use non_business=true only for personal/social conversations.
Write summary, desired_date, location, and required_intake_collected values in ${responseLanguage}.`
}

function normalizeForMatch(value: string) {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(COMBINING_MARKS_PATTERN, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function isGenericGreetingOnly(value: string) {
    const normalized = value.trim()
    if (!normalized) return true
    return GENERIC_GREETING_PATTERN.test(normalized)
}

export interface ServiceCatalogCandidate {
    name?: string | null
    aliases?: string[] | null
}

export function shouldAcceptInferredServiceType(options: {
    serviceType: string | null | undefined
    customerMessages: string[]
    catalogItems?: ServiceCatalogCandidate[]
}) {
    const serviceType = (options.serviceType ?? '').trim()
    if (!serviceType) return false

    const customerMessages = (options.customerMessages ?? [])
        .map((message) => message.trim())
        .filter(Boolean)

    if (customerMessages.length === 0) return false
    if (customerMessages.every(isGenericGreetingOnly)) return false

    const normalizedMessages = customerMessages.map(normalizeForMatch)
    const serviceTerms = new Set<string>()
    const normalizedServiceType = normalizeForMatch(serviceType)
    if (normalizedServiceType.length >= 3) {
        serviceTerms.add(normalizedServiceType)
    }

    for (const catalogItem of options.catalogItems ?? []) {
        const catalogName = normalizeForMatch((catalogItem.name ?? '').trim())
        const aliases = (catalogItem.aliases ?? [])
            .map((alias) => normalizeForMatch((alias ?? '').trim()))
            .filter((alias) => alias.length >= 3)

        const isLikelyMatchedCatalogItem = catalogName
            ? normalizedServiceType === catalogName
                || normalizedServiceType.includes(catalogName)
                || catalogName.includes(normalizedServiceType)
                || aliases.some((alias) => normalizedServiceType.includes(alias) || alias.includes(normalizedServiceType))
            : aliases.some((alias) => normalizedServiceType.includes(alias) || alias.includes(normalizedServiceType))

        if (!isLikelyMatchedCatalogItem) continue

        if (catalogName.length >= 3) {
            serviceTerms.add(catalogName)
        }
        aliases.forEach((alias) => serviceTerms.add(alias))
    }

    if (serviceTerms.size === 0) return false

    return normalizedMessages.some((message) => {
        return Array.from(serviceTerms).some((term) => message.includes(term))
    })
}

interface LeadExtractionMessageRecord {
    sender_type?: string | null
    content?: string | null
    created_at?: string | null
}

function normalizeLeadMessageContent(value: unknown) {
    if (typeof value !== 'string') return ''
    return value.trim()
}

function normalizeComparableLeadText(value: string) {
    return normalizeLeadMessageContent(value)
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('tr')
}

function toLeadConversationRole(senderType: string | null | undefined) {
    if (senderType === 'contact') return 'customer' as const
    if (senderType === 'bot') return 'assistant' as const
    if (senderType === 'user') return 'owner' as const
    return null
}

export function buildLeadExtractionConversationContext(options: {
    messages?: LeadExtractionMessageRecord[]
    latestCustomerMessage?: string | null
    maxTurns?: number
}) {
    const maxTurns = Math.max(1, Math.min(options.maxTurns ?? LEAD_EXTRACTION_MAX_CONTEXT_TURNS, 20))
    const turns = [...(options.messages ?? [])]
        .reverse()
        .map((message) => {
            const role = toLeadConversationRole(message.sender_type)
            const content = normalizeLeadMessageContent(message.content)
            if (!role || !content) return null
            return { role, content }
        })
        .filter((turn): turn is { role: 'customer' | 'assistant' | 'owner'; content: string } => Boolean(turn))

    const latestCustomerMessage = normalizeLeadMessageContent(options.latestCustomerMessage ?? '')
    if (latestCustomerMessage) {
        const lastCustomerTurn = [...turns]
            .reverse()
            .find((turn) => turn.role === 'customer')
        const hasLatestCustomerMessage = lastCustomerTurn
            ? normalizeComparableLeadText(lastCustomerTurn.content) === normalizeComparableLeadText(latestCustomerMessage)
            : false
        if (!hasLatestCustomerMessage) {
            turns.push({ role: 'customer', content: latestCustomerMessage })
        }
    }

    const customerMessages = turns
        .filter((turn) => turn.role === 'customer')
        .map((turn) => turn.content)
        .slice(-LEAD_EXTRACTION_MAX_CUSTOMER_MESSAGES)

    return {
        conversationTurns: turns
            .slice(-maxTurns)
            .map((turn) => `${turn.role}: ${turn.content}`),
        customerMessages
    }
}

function normalizeStringArray(value: unknown) {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((item) => item.trim())
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        return [value.trim()]
    }
    return []
}

function normalizeCollectedFieldValues(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {} as Record<string, string>
    }

    const collected: Record<string, string> = {}
    for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
        const key = rawKey.trim()
        if (!key) continue
        const normalizedValue = normalizeStringArray(rawValue)[0] ?? (
            typeof rawValue === 'number' || typeof rawValue === 'boolean'
                ? String(rawValue)
                : null
        )
        if (!normalizedValue) continue
        collected[key] = normalizedValue.trim()
    }

    return collected
}

function normalizeBoolean(value: unknown) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['true', 'yes', '1'].includes(normalized)) return true
        if (['false', 'no', '0'].includes(normalized)) return false
    }
    if (typeof value === 'number') return value !== 0
    return false
}

function normalizeScore(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.min(10, Math.round(value)))
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value)
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.min(10, Math.round(parsed)))
        }
        const match = value.match(/(\d{1,2})/)
        const captured = match?.[1]
        if (captured) {
            const fallback = Number.parseInt(captured, 10)
            if (Number.isFinite(fallback)) {
                return Math.max(0, Math.min(10, fallback))
            }
        }
    }
    return 0
}

function normalizeStatus(value: unknown) {
    if (typeof value !== 'string') return 'cold'
    const normalized = value.trim().toLowerCase()
    const aliases: Record<string, 'hot' | 'warm' | 'cold' | 'ignored' | 'undetermined'> = {
        'sıcak': 'hot',
        'sicak': 'hot',
        'ılık': 'warm',
        'ilik': 'warm',
        'soğuk': 'cold',
        'soguk': 'cold',
        'yok sayıldı': 'ignored',
        'yoksayıldı': 'ignored',
        'ignore': 'ignored',
        'ignored': 'ignored',
        'belirsiz': 'undetermined',
        'henüz belli değil': 'undetermined',
        'henuz belli degil': 'undetermined',
        'needs more info': 'undetermined',
        'needs_more_info': 'undetermined',
        'pending qualification': 'undetermined',
        'pending_qualification': 'undetermined',
        'undetermined': 'undetermined'
    }
    if (aliases[normalized]) return aliases[normalized]
    if (normalized === 'hot' || normalized === 'warm' || normalized === 'cold' || normalized === 'ignored' || normalized === 'undetermined') {
        return normalized
    }
    return 'cold'
}

function stripJsonFence(value: string) {
    const fenceMatch = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fenceMatch?.[1]) return fenceMatch[1].trim()
    return value
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
        } else if (char === '}' && depth > 0) {
            depth -= 1
            if (depth === 0 && startIndex !== -1) {
                return text.slice(startIndex, i + 1)
            }
        }
    }

    return null
}

function hasJsonKey(value: string, key: string) {
    const pattern = new RegExp(`"${key}"\\s*:`, 'i')
    return pattern.test(value)
}

export interface NormalizedLeadExtraction {
    service_type: string | null
    desired_date: string | null
    location: string | null
    budget_signals: string[]
    intent_signals: string[]
    risk_signals: string[]
    required_intake_collected: Record<string, string>
    non_business: boolean
    summary: string | null
    score: number
    status: 'hot' | 'warm' | 'cold' | 'ignored' | 'undetermined'
}

function normalizeExtractionPayload(payload: unknown): NormalizedLeadExtraction {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
            service_type: null,
            desired_date: null,
            location: null,
            budget_signals: [],
            intent_signals: [],
            risk_signals: [],
            required_intake_collected: {},
            non_business: false,
            summary: null,
            score: 0,
            status: 'cold'
        }
    }

    const payloadRecord = payload as Record<string, unknown>
    const nonBusiness = normalizeBoolean(payloadRecord.non_business)
    const score = nonBusiness ? 0 : normalizeScore(payloadRecord.score)
    const status = nonBusiness ? 'ignored' : normalizeStatus(payloadRecord.status)

    return {
        service_type:
            typeof payloadRecord.service_type === 'string' ? payloadRecord.service_type.trim() || null : null,
        desired_date:
            typeof payloadRecord.desired_date === 'string' ? payloadRecord.desired_date.trim() || null : null,
        location: typeof payloadRecord.location === 'string' ? payloadRecord.location.trim() || null : null,
        budget_signals: normalizeStringArray(payloadRecord.budget_signals),
        intent_signals: normalizeStringArray(payloadRecord.intent_signals),
        risk_signals: normalizeStringArray(payloadRecord.risk_signals),
        required_intake_collected: normalizeCollectedFieldValues(
            payloadRecord.required_intake_collected ?? payloadRecord.requiredIntakeCollected
        ),
        non_business: nonBusiness,
        summary: typeof payloadRecord.summary === 'string' ? payloadRecord.summary.trim() || null : null,
        score,
        status
    }
}

export function safeParseLeadExtraction(input: string) {
    try {
        const stripped = stripJsonFence(input ?? '')
        const candidate = extractFirstJsonObject(stripped) ?? stripped
        const parsed = JSON.parse(candidate)
        return normalizeExtractionPayload(parsed)
    } catch {
        return normalizeExtractionPayload(null)
    }
}

function normalizeOptionalString(value: unknown) {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
}

function normalizeExistingExtractedFields(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {} as Record<string, unknown>
    }
    return value as Record<string, unknown>
}

export function mergeExtractionWithExisting(
    incoming: NormalizedLeadExtraction,
    existingLead?: {
        service_type?: string | null
        summary?: string | null
        extracted_fields?: unknown
    } | null
): NormalizedLeadExtraction {
    const existingExtracted = normalizeExistingExtractedFields(existingLead?.extracted_fields)
    const existingCollected = normalizeCollectedFieldValues(existingExtracted.required_intake_collected)
    const incomingCollected = normalizeCollectedFieldValues(incoming.required_intake_collected)

    return {
        service_type: incoming.service_type ?? normalizeOptionalString(existingLead?.service_type) ?? null,
        desired_date: incoming.desired_date ?? normalizeOptionalString(existingExtracted.desired_date) ?? null,
        location: incoming.location ?? normalizeOptionalString(existingExtracted.location) ?? null,
        budget_signals: incoming.budget_signals.length > 0
            ? incoming.budget_signals
            : normalizeStringArray(existingExtracted.budget_signals),
        intent_signals: incoming.intent_signals.length > 0
            ? incoming.intent_signals
            : normalizeStringArray(existingExtracted.intent_signals),
        risk_signals: incoming.risk_signals.length > 0
            ? incoming.risk_signals
            : normalizeStringArray(existingExtracted.risk_signals),
        required_intake_collected: {
            ...existingCollected,
            ...incomingCollected
        },
        non_business: incoming.non_business,
        summary: incoming.summary,
        score: incoming.score,
        status: incoming.status
    }
}

function hasStrongIntentSignal(intentSignals: string[]) {
    return intentSignals
        .map((signal) => normalizeForMatch(signal))
        .some((normalizedSignal) => (
            normalizedSignal.includes('decisive')
            || normalizedSignal.includes('urgent')
            || normalizedSignal.includes('appointment')
            || normalizedSignal.includes('book')
            || normalizedSignal.includes('booking')
            || normalizedSignal.includes('randevu')
        ))
}

export function normalizeUndeterminedLeadStatus(options: {
    extracted: NormalizedLeadExtraction
    customerMessages: string[]
}) {
    const extracted = options.extracted

    const customerMessages = (options.customerMessages ?? [])
        .map((message) => message.trim())
        .filter(Boolean)

    const isGreetingOnlyConversation = customerMessages.length > 0 && customerMessages.every(isGenericGreetingOnly)
    if (isGreetingOnlyConversation) {
        return {
            ...extracted,
            non_business: false,
            score: Math.min(extracted.score, 2),
            status: 'undetermined'
        } satisfies NormalizedLeadExtraction
    }

    if (extracted.non_business) return extracted

    const hasStructuredLeadSignals = Boolean(
        extracted.service_type
        || extracted.desired_date
        || extracted.location
        || extracted.budget_signals.length > 0
        || Object.keys(extracted.required_intake_collected).length > 0
    )
    const hasStrongIntent = hasStrongIntentSignal(extracted.intent_signals)
    const lacksQualificationSignals = !hasStructuredLeadSignals && !hasStrongIntent
    const shouldMarkUndetermined = customerMessages.length === 0
        || isGreetingOnlyConversation
        || (lacksQualificationSignals && extracted.score <= 2)

    if (!shouldMarkUndetermined) return extracted

    return {
        ...extracted,
        score: Math.min(extracted.score, 2),
        status: 'undetermined'
    } satisfies NormalizedLeadExtraction
}

export async function runLeadExtraction(options: {
    organizationId: string
    conversationId: string
    latestMessage?: string
    preferredLocale?: string | null
    supabase?: SupabaseClientLike
    source?: 'telegram' | 'whatsapp' | 'instagram'
}) {
    const supabase = options.supabase ?? await createClient()

    const [{ data: profile }, { data: catalog }, { data: messages }, { data: suggestions }, { data: existingLead }] = await Promise.all([
        supabase
            .from('offering_profiles')
            .select('summary, manual_profile_note, catalog_enabled, ai_suggestions_enabled, ai_suggestions_locale, required_intake_fields')
            .eq('organization_id', options.organizationId)
            .maybeSingle(),
        supabase.from('service_catalog').select('name, aliases, active').eq('organization_id', options.organizationId).eq('active', true),
        supabase
            .from('messages')
            .select('sender_type, content, created_at')
            .eq('conversation_id', options.conversationId)
            .order('created_at', { ascending: false })
            .limit(LEAD_EXTRACTION_MAX_MESSAGES_TO_LOAD),
        supabase
            .from('offering_profile_suggestions')
            .select('content')
            .eq('organization_id', options.organizationId)
            .eq('status', 'approved')
            .is('archived_at', null)
            .is('update_of', null)
            .order('created_at', { ascending: false })
            .limit(5),
        supabase
            .from('leads')
            .select('service_type, summary, extracted_fields')
            .eq('conversation_id', options.conversationId)
            .maybeSingle()
    ])

    if (!process.env.OPENAI_API_KEY) return

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const catalogList = (catalog ?? []).map((row: { name?: string | null }) => row.name ?? '').join(', ')
    const latestMessage = (options.latestMessage ?? '').trim()
    const { conversationTurns, customerMessages } = buildLeadExtractionConversationContext({
        messages: (messages ?? []) as LeadExtractionMessageRecord[],
        latestCustomerMessage: latestMessage,
        maxTurns: LEAD_EXTRACTION_MAX_CONTEXT_TURNS
    })
    const customerContextMessages = customerMessages.map((content) => `customer: ${content}`)
    const suggestionText = (suggestions ?? [])
        .map((item: { content?: string | null }) => `- ${item.content}`)
        .reverse()
        .join('\n')
    const manualProfileNoteText = (profile?.manual_profile_note ?? '').trim()
    const profileText = [
        (profile?.summary ?? '').trim(),
        manualProfileNoteText ? `Manual profile note:\n${manualProfileNoteText}` : '',
        suggestionText ? `AI suggestions:\n${suggestionText}` : ''
    ]
        .filter(Boolean)
        .join('\n\n')
    const requiredIntakeFields = normalizeIntakeFields(profile?.required_intake_fields ?? [])
    const requiredIntakeBlock = requiredIntakeFields.length > 0
        ? requiredIntakeFields.map((field) => `- ${field}`).join('\n')
        : 'none'
    const extractionLocale = resolveLeadExtractionLocale({
        preferredLocale: options.preferredLocale,
        organizationLocale: profile?.ai_suggestions_locale ?? null,
        customerMessages,
        latestMessage
    })
    const responseLanguage = extractionLocale === 'tr' ? 'Turkish' : 'English'
    const extractionSystemPrompt = buildExtractionSystemPrompt(responseLanguage)

    const userPrompt = [
        `Preferred response language: ${responseLanguage}`,
        `Offering profile:\n${profileText}`,
        `Catalog:${catalogList}`,
        `Required intake fields:\n${requiredIntakeBlock}`,
        `Recent conversation turns (latest ${conversationTurns.length}, oldest to newest):\n${conversationTurns.length > 0 ? conversationTurns.join('\n') : 'none'}`,
        'Customer messages (latest 5, oldest to newest):',
        customerContextMessages.length > 0 ? customerContextMessages.join('\n') : 'none'
    ].join('\n\n')

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: LEAD_EXTRACTION_MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: extractionSystemPrompt },
            { role: 'user', content: userPrompt }
        ]
    })

    let response = completion.choices[0]?.message?.content?.trim() ?? '{}'
    let usageTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    const addUsage = (currentCompletion: typeof completion, prompt: string, output: string) => {
        if (currentCompletion.usage) {
            usageTotals = {
                inputTokens: usageTotals.inputTokens + (currentCompletion.usage.prompt_tokens ?? 0),
                outputTokens: usageTotals.outputTokens + (currentCompletion.usage.completion_tokens ?? 0),
                totalTokens: usageTotals.totalTokens + (currentCompletion.usage.total_tokens ?? ((currentCompletion.usage.prompt_tokens ?? 0) + (currentCompletion.usage.completion_tokens ?? 0)))
            }
        } else {
            const inputTokens = estimateTokenCount(extractionSystemPrompt) + estimateTokenCount(prompt)
            const outputTokens = estimateTokenCount(output)
            usageTotals = {
                inputTokens: usageTotals.inputTokens + inputTokens,
                outputTokens: usageTotals.outputTokens + outputTokens,
                totalTokens: usageTotals.totalTokens + inputTokens + outputTokens
            }
        }
    }

    addUsage(completion, userPrompt, response)

    if (!hasJsonKey(response, 'score') || !hasJsonKey(response, 'status') || !hasJsonKey(response, 'summary')) {
        const strictPrompt = `${userPrompt}\n\nReturn JSON with all required keys including summary, score, and status.`
        const retry = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            max_tokens: LEAD_EXTRACTION_MAX_OUTPUT_TOKENS,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: extractionSystemPrompt },
                { role: 'user', content: strictPrompt }
            ]
        })
        response = retry.choices[0]?.message?.content?.trim() ?? response
        addUsage(retry, strictPrompt, response)
    }
    let extracted = safeParseLeadExtraction(response)
    if (!shouldAcceptInferredServiceType({
        serviceType: extracted.service_type,
        customerMessages,
        catalogItems: (catalog ?? []) as ServiceCatalogCandidate[]
    })) {
        extracted = {
            ...extracted,
            service_type: null
        }
    }
    extracted = normalizeUndeterminedLeadStatus({ extracted, customerMessages })
    const normalizedExtracted = mergeExtractionWithExisting(extracted, existingLead)

    await supabase.from('leads').upsert({
        organization_id: options.organizationId,
        conversation_id: options.conversationId,
        service_type: normalizedExtracted.service_type,
        service_fit: 0,
        intent_score: 0,
        total_score: normalizedExtracted.score,
        status: normalizedExtracted.status,
        non_business: normalizedExtracted.non_business,
        summary: normalizedExtracted.summary,
        extracted_fields: {
            desired_date: normalizedExtracted.desired_date,
            location: normalizedExtracted.location,
            budget_signals: normalizedExtracted.budget_signals,
            intent_signals: normalizedExtracted.intent_signals,
            risk_signals: normalizedExtracted.risk_signals,
            required_intake_collected: normalizedExtracted.required_intake_collected
        },
        last_message_at: new Date().toISOString()
    }, { onConflict: 'conversation_id' })

    await recordAiUsage({
        organizationId: options.organizationId,
        category: 'lead_extraction',
        model: 'gpt-4o-mini',
        inputTokens: usageTotals.inputTokens,
        outputTokens: usageTotals.outputTokens,
        totalTokens: usageTotals.totalTokens,
        metadata: { conversation_id: options.conversationId, source: options.source },
        supabase
    })
}
