import OpenAI from 'openai'
import { messageMentionsField } from '@/lib/ai/intake-field-match'
import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { recordAiLatencyEvent } from '@/lib/ai/latency'
import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'
import { normalizeIntakeFields, normalizeServiceCatalogNames } from '@/lib/leads/offering-profile-utils'
import { repairRequiredIntakeFromConversation } from '@/lib/leads/required-intake-repair'
import { scoreLead } from '@/lib/leads/scoring'
import {
    normalizeRequiredIntakeFieldKey,
    normalizeRequiredIntakeFieldValue,
    type RequiredIntakeOverrideMetaEntry
} from '@/lib/leads/required-intake'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

const TURKISH_CHAR_PATTERN = /[ığüşöçİĞÜŞÖÇ]/
const TURKISH_WORD_PATTERN = /\b(merhaba|selam|fiyat|randevu|teşekkür|lütfen|yarın|bugün|müsait|kampanya|hizmet|çekim|cekim|vazgeçtim|vazgectim)\b/i
const ENGLISH_WORD_PATTERN = /\b(hello|hi|price|appointment|thank(s| you)|please|tomorrow|today|available|campaign|service|book|booking|schedule)\b/i
const GENERIC_GREETING_PATTERN = /^(?:hi|hello|hey|selam|merhaba|slm|tesekkurler|teşekkürler|thanks|thank you|ok|tamam|👍|👌|👋|🙏)[.!?\s]*$/i
const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g
const LEAD_EXTRACTION_MAX_OUTPUT_TOKENS = 320
const REQUIRED_INTAKE_REPAIR_MAX_OUTPUT_TOKENS = 180
const LEAD_EXTRACTION_MAX_CONTEXT_TURNS = 10
const LEAD_EXTRACTION_MAX_MESSAGES_TO_LOAD = 20
const LEAD_EXTRACTION_MAX_CUSTOMER_MESSAGES = 5
const PROFILE_SERVICE_SIGNAL_TOKEN_MIN_LENGTH = 8
const SERVICE_SIGNAL_TOKEN_MIN_LENGTH = 4
const PROFILE_SERVICE_SIGNAL_STOPWORDS = new Set([
    'hizmetleri',
    'hizmetimiz',
    'sunulanlar',
    'saglamaktayiz',
    'fotograf',
    'cekimleri',
    'cekimleri',
    'cekim',
    'çekim',
    'cekimi',
    'çekimi',
    'randevu',
    'fiyatlar',
    'bilgileri',
    'conditions',
    'services',
    'service',
    'studio',
    'shoot',
    'photoshoot',
    'appointment',
    'packages'
])
const SERVICE_SIGNAL_STOPWORDS = new Set([
    'hizmet',
    'service',
    'paket',
    'package',
    'urun',
    'ürün',
    'tedavi',
    'treatment',
    'therapy',
    'session',
    'seans',
    'oturum',
    'book',
    'booking',
    'appointment',
    'randevu',
    'fiyat',
    'price',
    'bilgi',
    'detay',
    'shoot',
    'photoshoot',
    'photo',
    'photography',
    'fotograf',
    'fotoğraf',
    'cekim',
    'çekim',
    'cekimi',
    'çekimi'
])
const SERVICE_CONTEXT_HINT_PATTERN = /\b(hizmet|service|paket|package|fiyat|price|bilgi|detay|randevu|appointment|book|booking|çekim|cekim|fotoğraf|fotograf|photoshoot|photography|shoot|tedavi|treatment|seans|session|kurs|program)\b/i
const DATE_LIKE_FIELD_TOKENS = ['tarih', 'date', 'dogum', 'doğum', 'due', 'termin', 'delivery', 'arrival']
const URGENT_SIGNAL_TOKENS = ['urgent', 'asap', 'acil', 'today', 'bugun', 'bugün', 'tomorrow', 'yarin', 'yarın']
const INDECISIVE_SIGNAL_TOKENS = ['indecisive', 'unsure', 'kararsiz', 'kararsız', 'bilmiyorum']
const FAR_FUTURE_SIGNAL_TOKENS = ['far future', 'far_future', 'months later', 'next season', 'ileride', 'aylar sonra']
const OPT_OUT_TOKENS = ['vazgecti', 'vazgeçti', 'vazgectim', 'vazgeçtim', 'istemiyor', 'istemiyorum', 'iptal', 'cancel']
const MEDIA_BACKED_COMMERCIAL_TOPIC_TOKENS = [
    'bilgi',
    'detay',
    'fiyat',
    'ucret',
    'price',
    'pricing',
    'detail',
    'details',
    'availability',
    'quote',
    'cost',
    'package',
    'packages',
    'paket'
]
const MEDIA_BACKED_COMMERCIAL_REQUEST_TOKENS = [
    'alabilir miyim',
    'almak istiyorum',
    'ogrenebilir miyim',
    'ogrenmek istiyorum',
    'verir misiniz',
    'paylasir misiniz',
    'istiyorum',
    'can i',
    'could i',
    'i want',
    'learn more',
    'more info',
    'tell me more'
]

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

export function buildExtractionSystemPrompt(responseLanguage: 'Turkish' | 'English') {
    return `Extract lead signals as JSON.
Return ONLY valid JSON (no code fences, no extra text).
Return keys: service_type, services, desired_date, location, budget_signals, intent_signals, intent_stage, risk_signals, non_business, summary, score, status, required_intake_collected.
intent_signals can include: decisive (explicit booking/appointment intent), urgent (ASAP/today/tomorrow), indecisive (unsure), far_future (months later/next season).
intent_stage must be one of: none, informational_commercial, qualification, booking_ready.
Use intent_stage semantically and sector-agnostically:
- none: greeting, social chat, unclear chatter, or non-commercial talk.
- informational_commercial: customer is gathering commercial info about an offering (pricing, package, availability, process, suitability, details) but is not yet clearly booking-ready.
- qualification: customer is actively evaluating fit/purchase and the conversation includes purchase-relevant context, answers, or clarifications.
- booking_ready: customer is explicitly ready to book, reserve, start, or take the next operational step now.
Recent conversation turns are labeled as one of: customer, owner, assistant.
Customer messages are labeled "customer:" and represent the latest 5 customer messages.
Prioritize customer intent and the most recent customer messages.
Use owner/assistant turns only as context to interpret short customer confirmations (for example: "yes", "evet", "correct").
Do not treat owner/assistant statements as customer facts unless the customer clearly confirms.
Do not infer service_type solely from assistant replies; require customer confirmation.
If the customer negates a service (e.g., "X istemiyorum"), do not output that service.
If customer messages are only greeting/acknowledgement and contain no service clue, service_type must be null.
services must be an array and can contain one or more services when customer asks about multiple services.
If one service is detected, return one item in services.
If no clear service is detected, return services as [] and service_type as null.
service_type should be the primary service in services (usually the first one) or null.
Score must be an integer from 0 to 10.
Status must be one of: hot, warm, cold.
If customer information is not enough to qualify intent (for example only greeting/acknowledgement or short unclear turns), use status=cold.
If non_business is true, set score to 0 and status to cold.
Use catalog names when possible for service_type and services.
If catalog is empty, infer service_type and services from offering profile summary/suggestions only when customer messages include a service clue.
If inferred service matches a provided catalog name, keep that catalog name exactly as-is.
If no catalog match exists, write inferred service_type and services in ${responseLanguage}.
When required intake fields are provided, fill required_intake_collected as an object that maps clearly collected field names to concise values.
Use the exact required intake field labels as object keys when filling required_intake_collected.
Match required fields by meaning, not only exact wording.
Approximate or range-style customer answers are valid values when that is what the customer provided.
High-confidence implied answers can be included, but never invent low-confidence values.
Only include fields clearly provided by the customer; otherwise omit them from the object.
If none are collected, return required_intake_collected as {}.
Messages indicating cancellation/decline (e.g., "vazgeçtim", "istemiyorum") are still business-context messages, not personal/social chat.
Use nulls if unknown. Use non_business=true only for personal/social conversations.
Write summary, desired_date, location, and required_intake_collected values in ${responseLanguage}.`
}

function buildRequiredIntakeRepairSystemPrompt(responseLanguage: 'Turkish' | 'English') {
    return `Repair missing required intake fields as JSON.
Return ONLY valid JSON with this shape: { "required_intake_collected": { "<Exact Field Label>": "<value>" } }.
Use only the listed missing required intake fields.
Always use the exact configured required field labels as object keys.
Infer values only when the conversation provides high-confidence evidence.
Do not invent low-confidence values.
Keep values concise and in ${responseLanguage}.`
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

function extractProfileServiceSignalTokens(value: string) {
    const normalized = normalizeForMatch(value)
    if (!normalized) return []

    return normalized
        .split(' ')
        .map((token) => token.trim())
        .filter((token) =>
            token.length >= PROFILE_SERVICE_SIGNAL_TOKEN_MIN_LENGTH
            && !PROFILE_SERVICE_SIGNAL_STOPWORDS.has(token)
        )
}

function extractServiceSignalTokens(value: string) {
    const normalized = normalizeForMatch(value)
    if (!normalized) return []

    return normalized
        .split(' ')
        .map((token) => token.trim())
        .filter((token) =>
            token.length >= SERVICE_SIGNAL_TOKEN_MIN_LENGTH
            && !SERVICE_SIGNAL_STOPWORDS.has(token)
        )
}

function textMatchesServiceEvidence(text: string, phrase: string) {
    const normalizedText = normalizeForMatch(text)
    const normalizedPhrase = normalizeForMatch(phrase)
    if (!normalizedText || !normalizedPhrase) return false
    if (normalizedText.includes(normalizedPhrase)) return true

    const phraseTokens = extractServiceSignalTokens(phrase)
    if (phraseTokens.length === 0) return false

    const textTokens = new Set(extractServiceSignalTokens(text))
    const overlapCount = phraseTokens.filter((token) => textTokens.has(token)).length
    if (overlapCount === 0) return false
    if (overlapCount >= Math.min(2, phraseTokens.length)) return true

    return SERVICE_CONTEXT_HINT_PATTERN.test(text)
}

function resolveRelatedCatalogServicePhrases(options: {
    serviceType: string | null | undefined
    catalogItems?: ServiceCatalogCandidate[]
}) {
    const serviceType = (options.serviceType ?? '').trim()
    if (!serviceType) return []

    const normalizedServiceType = normalizeForMatch(serviceType)
    const phrases = new Set<string>([serviceType])

    for (const catalogItem of options.catalogItems ?? []) {
        const catalogName = (catalogItem.name ?? '').trim()
        if (!catalogName) continue

        const aliases = (catalogItem.aliases ?? [])
            .map((alias) => (alias ?? '').trim())
            .filter(Boolean)
        const catalogTerms = [catalogName, ...aliases]
        const hasMatch = catalogTerms.some((term) => {
            const normalizedTerm = normalizeForMatch(term)
            return normalizedTerm.length >= 3 && (
                normalizedServiceType === normalizedTerm
                || normalizedServiceType.includes(normalizedTerm)
                || normalizedTerm.includes(normalizedServiceType)
            )
        })
        if (!hasMatch) continue

        phrases.add(catalogName)
        aliases.forEach((alias) => phrases.add(alias))
    }

    return Array.from(phrases)
}

function recoverCatalogServicesFromEvidence(options: {
    customerMessages: string[]
    summary?: string | null
    catalogItems?: ServiceCatalogCandidate[]
}) {
    const evidenceTexts = [
        ...(options.customerMessages ?? []),
        (options.summary ?? '').trim()
    ].filter(Boolean)
    if (evidenceTexts.length === 0) return []

    const recovered: string[] = []
    const seen = new Set<string>()

    for (const catalogItem of options.catalogItems ?? []) {
        const catalogName = (catalogItem.name ?? '').trim()
        if (!catalogName) continue

        const phrases = [catalogName, ...((catalogItem.aliases ?? []).map((alias) => (alias ?? '').trim()).filter(Boolean))]
        const matched = evidenceTexts.some((text) => (
            phrases.some((phrase) => textMatchesServiceEvidence(text, phrase))
        ))
        if (!matched) continue

        const key = normalizeForMatch(catalogName)
        if (!key || seen.has(key)) continue
        seen.add(key)
        recovered.push(catalogName)
    }

    return recovered
}

function hasProfileServiceSignal(options: {
    normalizedCustomerMessages: string[]
    profileSummary?: string | null
}) {
    const profileSummary = (options.profileSummary ?? '').trim()
    if (!profileSummary) return false

    const signalTokens = new Set(extractProfileServiceSignalTokens(profileSummary))
    if (signalTokens.size === 0) return false

    return options.normalizedCustomerMessages.some((message) =>
        Array.from(signalTokens).some((token) => message.includes(token))
    )
}

function resolveCatalogCanonicalServiceType(options: {
    serviceType: string | null | undefined
    catalogItems?: ServiceCatalogCandidate[]
}) {
    const serviceType = (options.serviceType ?? '').trim()
    if (!serviceType) return null

    const normalizedServiceType = normalizeForMatch(serviceType)
    if (!normalizedServiceType) return serviceType

    for (const catalogItem of options.catalogItems ?? []) {
        const catalogName = (catalogItem.name ?? '').trim()
        if (!catalogName) continue

        const normalizedCatalogName = normalizeForMatch(catalogName)
        const aliases = (catalogItem.aliases ?? [])
            .map((alias) => normalizeForMatch((alias ?? '').trim()))
            .filter((alias) => alias.length >= 3)

        const matchTerms = [
            normalizedCatalogName.length >= 3 ? normalizedCatalogName : '',
            ...aliases
        ].filter(Boolean)

        if (matchTerms.length === 0) continue

        const hasCatalogMatch = matchTerms.some((term) =>
            normalizedServiceType === term
            || normalizedServiceType.includes(term)
            || term.includes(normalizedServiceType)
        )

        if (hasCatalogMatch) return catalogName
    }

    return serviceType
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
    profileSummary?: string | null
    summary?: string | null
}) {
    const serviceType = (options.serviceType ?? '').trim()
    if (!serviceType) return false

    const customerMessages = (options.customerMessages ?? [])
        .map((message) => message.trim())
        .filter(Boolean)

    if (customerMessages.length === 0) return false
    if (customerMessages.every(isGenericGreetingOnly)) return false

    const normalizedMessages = customerMessages.map(normalizeForMatch)
    const evidenceTexts = [...customerMessages]
    const summary = (options.summary ?? '').trim()
    if (summary) {
        evidenceTexts.push(summary)
    }

    const servicePhrases = resolveRelatedCatalogServicePhrases({
        serviceType,
        catalogItems: options.catalogItems
    })

    if (servicePhrases.length > 0) {
        const hasServiceEvidence = evidenceTexts.some((text) => (
            servicePhrases.some((phrase) => textMatchesServiceEvidence(text, phrase))
        ))
        if (hasServiceEvidence) return true
    }

    return hasProfileServiceSignal({
        normalizedCustomerMessages: normalizedMessages,
        profileSummary: options.profileSummary
    })
}

export function resolvePersistedServiceType(options: {
    serviceType: string | null | undefined
    customerMessages: string[]
    catalogItems?: ServiceCatalogCandidate[]
    profileSummary?: string | null
    summary?: string | null
}) {
    if (!shouldAcceptInferredServiceType(options)) return null
    return resolveCatalogCanonicalServiceType({
        serviceType: options.serviceType,
        catalogItems: options.catalogItems
    })
}

export function resolvePersistedServiceTypes(options: {
    serviceType: string | null | undefined
    services?: string[] | null
    customerMessages: string[]
    catalogItems?: ServiceCatalogCandidate[]
    profileSummary?: string | null
    summary?: string | null
}) {
    const rawCandidates = normalizeServiceCatalogNames([
        ...(options.services ?? []),
        ...(options.serviceType ? [options.serviceType] : [])
    ])

    if (rawCandidates.length === 0) {
        return recoverCatalogServicesFromEvidence({
            customerMessages: options.customerMessages,
            summary: options.summary,
            catalogItems: options.catalogItems
        })
    }

    const persisted: string[] = []
    const seen = new Set<string>()

    for (const candidate of rawCandidates) {
        const next = resolvePersistedServiceType({
            serviceType: candidate,
            customerMessages: options.customerMessages,
            catalogItems: options.catalogItems,
            profileSummary: options.profileSummary,
            summary: options.summary
        })

        if (!next) continue
        const key = normalizeForMatch(next)
        if (!key || seen.has(key)) continue
        seen.add(key)
        persisted.push(next)
    }

    return persisted
}

export interface LeadExtractionMessageRecord {
    sender_type?: string | null
    content?: string | null
    created_at?: string | null
    metadata?: unknown
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMessageMetadataRecord(metadata: unknown) {
    if (isRecord(metadata)) return metadata
    if (typeof metadata !== 'string') return null
    const trimmed = metadata.trim()
    if (!trimmed) return null
    try {
        const parsed = JSON.parse(trimmed)
        return isRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

function readMediaMetadataNode(metadata: Record<string, unknown>) {
    if (isRecord(metadata.whatsapp_media)) return metadata.whatsapp_media
    if (isRecord(metadata.instagram_media)) return metadata.instagram_media
    return null
}

function hasMediaMetadata(metadata: Record<string, unknown>) {
    if (readMediaMetadataNode(metadata)) return true

    const whatsappMessageType = typeof metadata.whatsapp_message_type === 'string'
        ? metadata.whatsapp_message_type.trim().toLowerCase()
        : ''
    if (['image', 'document', 'audio', 'video', 'sticker'].includes(whatsappMessageType)) return true

    const instagramEventType = typeof metadata.instagram_event_type === 'string'
        ? metadata.instagram_event_type.trim().toLowerCase()
        : ''
    return instagramEventType === 'attachment'
}

function isKnownMediaPlaceholderContent(value: string) {
    return /^\[(?:whatsapp|instagram)\s(?:image|document|audio|video|sticker|media|attachment)(?::[^\]]+)?\]$/i.test(value)
}

function resolveLeadExtractionMessageContent(message: LeadExtractionMessageRecord) {
    const content = normalizeLeadMessageContent(message.content)
    const metadata = parseMessageMetadataRecord(message.metadata)
    if (!metadata || !hasMediaMetadata(metadata)) return content

    const mediaNode = readMediaMetadataNode(metadata)
    const caption = mediaNode ? normalizeLeadMessageContent(mediaNode.caption) : ''

    if (content && !isKnownMediaPlaceholderContent(content)) return content
    if (caption) return caption
    return ''
}

function isMediaBackedCommercialInquiryText(content: string) {
    const normalized = normalizeForMatch(content)
    if (!normalized || isGenericGreetingOnly(content)) return false

    const hasCommercialTopic = MEDIA_BACKED_COMMERCIAL_TOPIC_TOKENS.some((token) => normalized.includes(token))
    if (!hasCommercialTopic) return false

    return MEDIA_BACKED_COMMERCIAL_REQUEST_TOKENS.some((token) => normalized.includes(token))
}

function hasRecentMediaBackedCommercialInquiry(messages: LeadExtractionMessageRecord[]) {
    return messages.some((message) => {
        if (toLeadConversationRole(message.sender_type) !== 'customer') return false

        const metadata = parseMessageMetadataRecord(message.metadata)
        if (!metadata || !hasMediaMetadata(metadata)) return false

        return isMediaBackedCommercialInquiryText(resolveLeadExtractionMessageContent(message))
    })
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
            const content = resolveLeadExtractionMessageContent(message)
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
    const assistantMessages = turns
        .filter((turn) => turn.role !== 'customer')
        .map((turn) => turn.content)
        .slice(-3)

    return {
        conversationTurns: turns
            .slice(-maxTurns)
            .map((turn) => `${turn.role}: ${turn.content}`),
        customerMessages,
        assistantMessages
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
    const aliases: Record<string, 'hot' | 'warm' | 'cold'> = {
        'sıcak': 'hot',
        'sicak': 'hot',
        'ılık': 'warm',
        'ilik': 'warm',
        'soğuk': 'cold',
        'soguk': 'cold',
        // Legacy status aliases are collapsed into cold.
        'yok sayıldı': 'cold',
        'yoksayıldı': 'cold',
        'ignore': 'cold',
        'ignored': 'cold',
        'belirsiz': 'cold',
        'henüz belli değil': 'cold',
        'henuz belli degil': 'cold',
        'needs more info': 'cold',
        'needs_more_info': 'cold',
        'pending qualification': 'cold',
        'pending_qualification': 'cold',
        'undetermined': 'cold'
    }
    if (aliases[normalized]) return aliases[normalized]
    if (normalized === 'hot' || normalized === 'warm' || normalized === 'cold') {
        return normalized
    }
    return 'cold'
}

export type CommercialIntentStage =
    | 'none'
    | 'informational_commercial'
    | 'qualification'
    | 'booking_ready'

function normalizeIntentStage(value: unknown): CommercialIntentStage | null {
    if (typeof value !== 'string') return null

    const normalized = normalizeForMatch(value).replace(/\s+/g, '_')
    const aliases: Record<string, CommercialIntentStage> = {
        none: 'none',
        no_intent: 'none',
        unclear: 'none',
        unknown: 'none',
        informational_commercial: 'informational_commercial',
        informationalcommercial: 'informational_commercial',
        commercial_information: 'informational_commercial',
        info_request: 'informational_commercial',
        qualification: 'qualification',
        qualifying: 'qualification',
        evaluation: 'qualification',
        evaluating: 'qualification',
        booking_ready: 'booking_ready',
        bookingready: 'booking_ready',
        ready_to_book: 'booking_ready',
        appointment_ready: 'booking_ready'
    }

    return aliases[normalized] ?? null
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
    services: string[]
    service_override?: string | null
    service_override_meta?: RequiredIntakeOverrideMetaEntry | null
    desired_date: string | null
    location: string | null
    budget_signals: string[]
    intent_signals: string[]
    intent_stage?: CommercialIntentStage | null
    risk_signals: string[]
    required_intake_collected: Record<string, string>
    required_intake_overrides: Record<string, string>
    required_intake_override_meta: Record<string, RequiredIntakeOverrideMetaEntry>
    non_business: boolean
    summary: string | null
    score: number
    status: 'hot' | 'warm' | 'cold'
}

function normalizeExtractionPayload(payload: unknown): NormalizedLeadExtraction {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
            service_type: null,
            services: [],
            service_override: null,
            service_override_meta: null,
            desired_date: null,
            location: null,
            budget_signals: [],
            intent_signals: [],
            intent_stage: null,
            risk_signals: [],
            required_intake_collected: {},
            required_intake_overrides: {},
            required_intake_override_meta: {},
            non_business: false,
            summary: null,
            score: 0,
            status: 'cold'
        }
    }

    const payloadRecord = payload as Record<string, unknown>
    const nonBusiness = normalizeBoolean(payloadRecord.non_business)
    const score = nonBusiness ? 0 : normalizeScore(payloadRecord.score)
    const status = nonBusiness ? 'cold' : normalizeStatus(payloadRecord.status)
    const rawServiceType = typeof payloadRecord.service_type === 'string'
        ? payloadRecord.service_type.trim() || null
        : null
    const rawServices = normalizeStringArray(
        payloadRecord.services
            ?? payloadRecord.service_types
            ?? payloadRecord.serviceTypes
    )
    const normalizedServices = normalizeServiceCatalogNames(
        rawServices.length > 0
            ? rawServices
            : (rawServiceType ? [rawServiceType] : [])
    )

    return {
        service_type: rawServiceType ?? normalizedServices[0] ?? null,
        services: normalizedServices,
        service_override: null,
        service_override_meta: null,
        desired_date:
            typeof payloadRecord.desired_date === 'string' ? payloadRecord.desired_date.trim() || null : null,
        location: typeof payloadRecord.location === 'string' ? payloadRecord.location.trim() || null : null,
        budget_signals: normalizeStringArray(payloadRecord.budget_signals),
        intent_signals: normalizeStringArray(payloadRecord.intent_signals),
        intent_stage: normalizeIntentStage(payloadRecord.intent_stage ?? payloadRecord.intentStage),
        risk_signals: normalizeStringArray(payloadRecord.risk_signals),
        required_intake_collected: normalizeCollectedFieldValues(
            payloadRecord.required_intake_collected ?? payloadRecord.requiredIntakeCollected
        ),
        required_intake_overrides: {},
        required_intake_override_meta: {},
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

export function parseRequiredIntakeRepairPayload(raw: string, allowedFields: string[]) {
    const normalizedAllowedFields = normalizeIntakeFields(allowedFields)
    if (normalizedAllowedFields.length === 0) return {} as Record<string, string>

    const trimmed = raw.trim()
    if (!trimmed) return {} as Record<string, string>

    const candidates = [
        trimmed,
        stripJsonFence(trimmed),
        extractFirstJsonObject(stripJsonFence(trimmed))
    ].filter((item): item is string => Boolean(item))
    const seen = new Set<string>()

    for (const candidate of candidates) {
        if (seen.has(candidate)) continue
        seen.add(candidate)

        try {
            const parsed = JSON.parse(candidate)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue

            const parsedObject = parsed as Record<string, unknown>
            const rawCollected = parsedObject.required_intake_collected ?? parsedObject.requiredIntakeCollected
            if (!rawCollected || typeof rawCollected !== 'object' || Array.isArray(rawCollected)) continue

            const collectedEntries = Object.entries(rawCollected as Record<string, unknown>)
            const repaired: Record<string, string> = {}

            for (const allowedField of normalizedAllowedFields) {
                const normalizedAllowedKey = normalizeRequiredIntakeFieldKey(allowedField)
                const matchingEntry = collectedEntries.find(([candidateKey]) => {
                    const normalizedCandidateKey = normalizeRequiredIntakeFieldKey(candidateKey)
                    if (!normalizedCandidateKey) return false
                    if (normalizedCandidateKey === normalizedAllowedKey) return true
                    return (
                        messageMentionsField(allowedField, candidateKey)
                        || messageMentionsField(candidateKey, allowedField)
                    )
                })
                if (!matchingEntry) continue

                const normalizedValue = normalizeRequiredIntakeFieldValue(matchingEntry[1])
                if (!normalizedValue) continue
                repaired[allowedField] = normalizedValue
            }

            return repaired
        } catch {
            continue
        }
    }

    return {} as Record<string, string>
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

function normalizeRequiredIntakeOverrideMeta(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {} as Record<string, RequiredIntakeOverrideMetaEntry>
    }

    const normalized: Record<string, RequiredIntakeOverrideMetaEntry> = {}

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        const normalizedKey = normalizeRequiredIntakeFieldKey(key)
        if (!normalizedKey || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue

        const record = entry as Record<string, unknown>
        normalized[normalizedKey] = {
            updated_at: typeof record.updated_at === 'string' ? record.updated_at : null,
            updated_by: typeof record.updated_by === 'string' ? record.updated_by : null,
            source: 'manual'
        }
    }

    return normalized
}

function normalizeOverrideValues(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {} as Record<string, string>
    }

    const normalized: Record<string, string> = {}

    for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
        const normalizedKey = normalizeRequiredIntakeFieldKey(key)
        const normalizedValue = normalizeRequiredIntakeFieldValue(rawValue)
        if (!normalizedKey || !normalizedValue) continue
        normalized[normalizedKey] = normalizedValue
    }

    return normalized
}

function normalizeServiceOverrideMeta(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }

    const record = value as Record<string, unknown>
    return {
        updated_at: typeof record.updated_at === 'string' ? record.updated_at : null,
        updated_by: typeof record.updated_by === 'string' ? record.updated_by : null,
        source: 'manual'
    } satisfies RequiredIntakeOverrideMetaEntry
}

function rankCommercialIntentStage(stage: CommercialIntentStage | null | undefined) {
    switch (stage) {
        case 'informational_commercial':
            return 1
        case 'qualification':
            return 2
        case 'booking_ready':
            return 3
        default:
            return 0
    }
}

function mergeCommercialIntentStage(
    incoming: CommercialIntentStage | null | undefined,
    existing: unknown
) {
    const normalizedIncoming = normalizeIntentStage(incoming)
    const normalizedExisting = normalizeIntentStage(existing)
    return rankCommercialIntentStage(normalizedIncoming) >= rankCommercialIntentStage(normalizedExisting)
        ? normalizedIncoming
        : normalizedExisting
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
    const existingOverrides = normalizeOverrideValues(
        existingExtracted.required_intake_overrides ?? existingExtracted.manual_required_intake
    )
    const incomingOverrides = normalizeOverrideValues(incoming.required_intake_overrides)
    const mergedOverrides = {
        ...existingOverrides,
        ...incomingOverrides
    }
    const existingOverrideMeta = normalizeRequiredIntakeOverrideMeta(existingExtracted.required_intake_override_meta)
    const incomingOverrideMeta = normalizeRequiredIntakeOverrideMeta(incoming.required_intake_override_meta)
    const mergedOverrideMetaEntries = {
        ...existingOverrideMeta,
        ...incomingOverrideMeta
    }
    const mergedOverrideMeta = Object.fromEntries(
        Object.entries(mergedOverrideMetaEntries).filter(([key]) => Boolean(mergedOverrides[key]))
    ) as Record<string, RequiredIntakeOverrideMetaEntry>
    const incomingServices = normalizeServiceCatalogNames([
        ...incoming.services,
        ...(incoming.service_type ? [incoming.service_type] : [])
    ])
    const mergedServiceOverride = normalizeOptionalString(incoming.service_override)
        ?? normalizeOptionalString(existingExtracted.service_override)
        ?? null
    const mergedServiceOverrideMeta = mergedServiceOverride
        ? (normalizeServiceOverrideMeta(incoming.service_override_meta)
            ?? normalizeServiceOverrideMeta(existingExtracted.service_override_meta)
            ?? {
                updated_at: null,
                updated_by: null,
                source: 'manual'
            })
        : null

    const merged = {
        service_type: mergedServiceOverride ?? incomingServices[0] ?? null,
        services: incomingServices,
        service_override: mergedServiceOverride,
        service_override_meta: mergedServiceOverrideMeta,
        desired_date: incoming.desired_date ?? normalizeOptionalString(existingExtracted.desired_date) ?? null,
        location: incoming.location ?? normalizeOptionalString(existingExtracted.location) ?? null,
        budget_signals: incoming.budget_signals.length > 0
            ? incoming.budget_signals
            : normalizeStringArray(existingExtracted.budget_signals),
        intent_signals: incoming.intent_signals.length > 0
            ? incoming.intent_signals
            : normalizeStringArray(existingExtracted.intent_signals),
        intent_stage: mergeCommercialIntentStage(incoming.intent_stage, existingExtracted.intent_stage),
        risk_signals: incoming.risk_signals.length > 0
            ? incoming.risk_signals
            : normalizeStringArray(existingExtracted.risk_signals),
        required_intake_collected: {
            ...existingCollected,
            ...incomingCollected
        },
        required_intake_overrides: mergedOverrides,
        required_intake_override_meta: mergedOverrideMeta,
        non_business: incoming.non_business,
        summary: incoming.summary,
        score: incoming.score,
        status: incoming.status
    }

    const calibratedScore = calibrateLeadScoreFromExtraction(merged)

    return {
        ...merged,
        score: calibratedScore.totalScore,
        status: calibratedScore.status
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

function resolveLeadStatusFromScore(totalScore: number) {
    if (totalScore >= 8) return 'hot' as const
    if (totalScore >= 5) return 'warm' as const
    return 'cold' as const
}

function hasSignalToken(signals: string[], tokens: string[]) {
    const normalizedSignals = signals
        .map((signal) => normalizeForMatch(signal))
        .filter(Boolean)

    return normalizedSignals.some((signal) => tokens.some((token) => signal.includes(token)))
}

function hasDateLikeRequiredIntake(collected: Record<string, string>) {
    return Object.entries(collected).some(([field, value]) => {
        if (!normalizeRequiredIntakeFieldValue(value)) return false
        const normalizedField = normalizeForMatch(field)
        return DATE_LIKE_FIELD_TOKENS.some((token) => normalizedField.includes(token))
    })
}

function hasOptOutSummary(summary: string | null | undefined) {
    const normalizedSummary = normalizeForMatch(summary ?? '')
    if (!normalizedSummary) return false
    return OPT_OUT_TOKENS.some((token) => normalizedSummary.includes(token))
}

function resolveCommercialIntentStageFloor(options: {
    intentStage: CommercialIntentStage | null | undefined
    hasCatalogMatch: boolean
    hasServiceSpecificIntake: boolean
    hasDate: boolean
}) {
    const hasQualificationContext = options.hasCatalogMatch || options.hasServiceSpecificIntake || options.hasDate

    switch (options.intentStage) {
        case 'informational_commercial':
            return 5
        case 'qualification':
            return hasQualificationContext ? 8 : 6
        case 'booking_ready':
            return hasQualificationContext ? 9 : 6
        default:
            return 0
    }
}

export function calibrateLeadScoreFromExtraction(extracted: NormalizedLeadExtraction) {
    if (extracted.non_business || hasOptOutSummary(extracted.summary)) {
        return {
            serviceFit: 0,
            intentScore: 0,
            totalScore: 0,
            status: 'cold' as const
        }
    }

    const hasCatalogMatch = Boolean(extracted.service_type) || extracted.services.length > 0
    const hasServiceSpecificIntake = Object.keys(extracted.required_intake_collected).length > 0
    const hasDate = Boolean(extracted.desired_date) || hasDateLikeRequiredIntake(extracted.required_intake_collected)
    const intentStage = normalizeIntentStage(extracted.intent_stage)
    const base = scoreLead({
        hasCatalogMatch,
        hasProfileMatch: !hasCatalogMatch && hasServiceSpecificIntake,
        hasDate,
        hasBudget: extracted.budget_signals.length > 0,
        isDecisive: hasStrongIntentSignal(extracted.intent_signals),
        isUrgent: hasSignalToken(extracted.intent_signals, URGENT_SIGNAL_TOKENS),
        isIndecisive: hasSignalToken(extracted.intent_signals, INDECISIVE_SIGNAL_TOKENS)
            || hasSignalToken(extracted.risk_signals, INDECISIVE_SIGNAL_TOKENS),
        isFarFuture: hasSignalToken(extracted.intent_signals, FAR_FUTURE_SIGNAL_TOKENS)
    })

    const serviceContextBoost = !hasCatalogMatch && hasServiceSpecificIntake ? 1 : 0
    const serviceFit = Math.max(0, Math.min(4, base.serviceFit + serviceContextBoost))
    const stageFloor = resolveCommercialIntentStageFloor({
        intentStage,
        hasCatalogMatch,
        hasServiceSpecificIntake,
        hasDate
    })
    const totalScore = Math.max(
        0,
        Math.min(10, Math.max(base.totalScore + serviceContextBoost, stageFloor))
    )
    const intentScore = Math.max(0, Math.min(6, Math.max(base.intentScore, totalScore - serviceFit)))

    return {
        serviceFit,
        intentScore,
        totalScore,
        status: resolveLeadStatusFromScore(totalScore)
    }
}

export function normalizeLowSignalLeadStatus(options: {
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
            intent_stage: 'none',
            non_business: false,
            score: Math.min(extracted.score, 2),
            status: 'cold'
        } satisfies NormalizedLeadExtraction
    }

    if (extracted.non_business) return extracted

    const hasStructuredLeadSignals = Boolean(
        extracted.service_type
        || extracted.services.length > 0
        || extracted.desired_date
        || extracted.location
        || extracted.budget_signals.length > 0
        || Object.keys(extracted.required_intake_collected).length > 0
    )
    const hasStrongIntent = hasStrongIntentSignal(extracted.intent_signals)
    const lacksQualificationSignals = !hasStructuredLeadSignals && !hasStrongIntent
    const shouldMarkLowSignalCold = customerMessages.length === 0
        || isGreetingOnlyConversation
        || (lacksQualificationSignals && extracted.score <= 2)

    if (!shouldMarkLowSignalCold) return extracted

    return {
        ...extracted,
        intent_stage: 'none',
        score: Math.min(extracted.score, 2),
        status: 'cold'
    } satisfies NormalizedLeadExtraction
}

export function promoteMediaBackedCommercialIntent(options: {
    extracted: NormalizedLeadExtraction
    messages?: LeadExtractionMessageRecord[]
}) {
    const extracted = options.extracted

    if (!hasRecentMediaBackedCommercialInquiry(options.messages ?? [])) {
        return extracted
    }

    return {
        ...extracted,
        intent_stage: mergeCommercialIntentStage('informational_commercial', extracted.intent_stage),
        non_business: false,
        score: Math.max(extracted.score, 5),
        status: extracted.status === 'hot' ? 'hot' : 'warm'
    } satisfies NormalizedLeadExtraction
}

export function repairLeadExtractionRequiredIntake(options: {
    extracted: NormalizedLeadExtraction
    requiredFields: string[]
    recentAssistantMessages?: string[]
    recentCustomerMessages?: string[]
}) {
    return {
        ...options.extracted,
        required_intake_collected: repairRequiredIntakeFromConversation({
            requiredFields: options.requiredFields,
            existingCollected: options.extracted.required_intake_collected,
            recentAssistantMessages: options.recentAssistantMessages ?? [],
            recentCustomerMessages: options.recentCustomerMessages ?? []
        })
    } satisfies NormalizedLeadExtraction
}

function resolveMissingRequiredIntakeFields(requiredFields: string[], collected: Record<string, string>) {
    const collectedKeys = new Set(
        Object.keys(collected)
            .map((field) => normalizeRequiredIntakeFieldKey(field))
            .filter(Boolean)
    )

    return normalizeIntakeFields(requiredFields).filter((field) => (
        !collectedKeys.has(normalizeRequiredIntakeFieldKey(field))
    ))
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
    const latencyStartedAt = Date.now()

    const [{ data: profile }, { data: catalog }, { data: messages }, { data: suggestions }, { data: existingLead }] = await Promise.all([
        supabase
            .from('offering_profiles')
            .select('summary, manual_profile_note, catalog_enabled, ai_suggestions_enabled, ai_suggestions_locale, required_intake_fields')
            .eq('organization_id', options.organizationId)
            .maybeSingle(),
        supabase.from('service_catalog').select('name, aliases, active').eq('organization_id', options.organizationId).eq('active', true),
        supabase
            .from('messages')
            .select('sender_type, content, created_at, metadata')
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

    const entitlement = await resolveOrganizationUsageEntitlement(options.organizationId, { supabase })
    if (!entitlement.isUsageAllowed) {
        console.info('Lead extraction skipped due to billing lock', {
            organization_id: options.organizationId,
            conversation_id: options.conversationId,
            membership_state: entitlement.membershipState,
            lock_reason: entitlement.lockReason
        })
        return
    }

    if (!process.env.OPENAI_API_KEY) return

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const catalogList = (catalog ?? []).length > 0
        ? (catalog ?? [])
            .map((row: { name?: string | null; aliases?: string[] | null }) => {
                const name = (row.name ?? '').trim()
                if (!name) return null
                const aliases = (row.aliases ?? [])
                    .map((alias) => alias.trim())
                    .filter(Boolean)
                if (aliases.length === 0) return `- ${name}`
                return `- ${name} (aliases: ${aliases.join(', ')})`
            })
            .filter((item): item is string => Boolean(item))
            .join('\n')
        : 'none'
    const latestMessage = (options.latestMessage ?? '').trim()
    const { conversationTurns, customerMessages, assistantMessages } = buildLeadExtractionConversationContext({
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
        `Catalog:\n${catalogList}`,
        `Required intake fields:\n${requiredIntakeBlock}`,
        `Recent conversation turns (latest ${conversationTurns.length}, oldest to newest):\n${conversationTurns.length > 0 ? conversationTurns.join('\n') : 'none'}`,
        'Customer messages (latest 5, oldest to newest):',
        customerContextMessages.length > 0 ? customerContextMessages.join('\n') : 'none'
    ]
        .join('\n\n')

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
        const retryEntitlement = await resolveOrganizationUsageEntitlement(options.organizationId, { supabase })
        if (!retryEntitlement.isUsageAllowed) {
            console.info('Lead extraction retry skipped due to billing lock', {
                organization_id: options.organizationId,
                conversation_id: options.conversationId,
                membership_state: retryEntitlement.membershipState,
                lock_reason: retryEntitlement.lockReason
            })
            return
        }

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
    const persistedServiceTypes = resolvePersistedServiceTypes({
        serviceType: extracted.service_type,
        services: extracted.services,
        customerMessages,
        catalogItems: (catalog ?? []) as ServiceCatalogCandidate[],
        profileSummary: profileText,
        summary: extracted.summary
    })
    const persistedPrimaryService = persistedServiceTypes[0] ?? null
    extracted = {
        ...extracted,
        service_type: persistedPrimaryService,
        services: persistedServiceTypes
    }
    extracted = normalizeLowSignalLeadStatus({ extracted, customerMessages })
    extracted = promoteMediaBackedCommercialIntent({
        extracted,
        messages: (messages ?? []) as LeadExtractionMessageRecord[]
    })
    extracted = repairLeadExtractionRequiredIntake({
        extracted,
        requiredFields: requiredIntakeFields,
        recentAssistantMessages: assistantMessages,
        recentCustomerMessages: customerMessages
    })
    const missingRequiredIntakeFields = resolveMissingRequiredIntakeFields(
        requiredIntakeFields,
        extracted.required_intake_collected
    )
    if (missingRequiredIntakeFields.length > 0 && conversationTurns.length > 0) {
        const repairSystemPrompt = buildRequiredIntakeRepairSystemPrompt(responseLanguage)
        const repairUserPrompt = [
            `Missing required intake fields:\n${missingRequiredIntakeFields.map((field) => `- ${field}`).join('\n')}`,
            `Already collected required intake:\n${Object.keys(extracted.required_intake_collected).length > 0
                ? Object.entries(extracted.required_intake_collected).map(([field, value]) => `- ${field}: ${value}`).join('\n')
                : 'none'}`,
            `Recent conversation turns (oldest to newest):\n${conversationTurns.join('\n')}`
        ].join('\n\n')
        const repairCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.1,
            max_tokens: REQUIRED_INTAKE_REPAIR_MAX_OUTPUT_TOKENS,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: repairSystemPrompt },
                { role: 'user', content: repairUserPrompt }
            ]
        })
        const repairResponse = repairCompletion.choices[0]?.message?.content?.trim() ?? '{}'
        addUsage(repairCompletion, repairUserPrompt, repairResponse)
        const repairedCollected = parseRequiredIntakeRepairPayload(
            repairResponse,
            missingRequiredIntakeFields
        )
        if (Object.keys(repairedCollected).length > 0) {
            extracted = {
                ...extracted,
                required_intake_collected: {
                    ...extracted.required_intake_collected,
                    ...repairedCollected
                }
            }
        }
    }
    const normalizedExtracted = mergeExtractionWithExisting(extracted, existingLead)
    const calibratedScore = calibrateLeadScoreFromExtraction(normalizedExtracted)

    await supabase.from('leads').upsert({
        organization_id: options.organizationId,
        conversation_id: options.conversationId,
        service_type: normalizedExtracted.service_type,
        service_fit: calibratedScore.serviceFit,
        intent_score: calibratedScore.intentScore,
        total_score: calibratedScore.totalScore,
        status: calibratedScore.status,
        non_business: normalizedExtracted.non_business,
        summary: normalizedExtracted.summary,
        extracted_fields: {
            services: normalizedExtracted.services,
            service_override: normalizedExtracted.service_override ?? null,
            service_override_meta: normalizedExtracted.service_override_meta ?? null,
            desired_date: normalizedExtracted.desired_date,
            location: normalizedExtracted.location,
            budget_signals: normalizedExtracted.budget_signals,
            intent_signals: normalizedExtracted.intent_signals,
            intent_stage: normalizedExtracted.intent_stage ?? null,
            risk_signals: normalizedExtracted.risk_signals,
            required_intake_collected: normalizedExtracted.required_intake_collected,
            required_intake_overrides: normalizedExtracted.required_intake_overrides,
            required_intake_override_meta: normalizedExtracted.required_intake_override_meta
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

    await recordAiLatencyEvent({
        organizationId: options.organizationId,
        conversationId: options.conversationId,
        metricKey: 'lead_extraction',
        durationMs: Date.now() - latencyStartedAt,
        source: options.source ?? 'unknown',
        metadata: {
            locale: extractionLocale,
            model: 'gpt-4o-mini'
        }
    }, {
        supabase
    })
}
