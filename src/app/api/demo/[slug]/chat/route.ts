import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import {
    isOutboundImageMessage,
    normalizeOutboundMessage,
    type OutboundMessageInput,
} from '@/lib/channels/outbound-message'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'
import { verifyDemoChatAccessToken } from '@/lib/demo-chat/access'
import { buildDemoChatContactId, resolveDemoChatChannel } from '@/lib/demo-chat/channel'
import { resolveMvpResponseLanguage, type MvpResponseLanguage } from '@/lib/ai/language'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { recordAiUsage } from '@/lib/ai/usage'
import { searchKnowledgeBase, searchKnowledgeBaseFocusedEvidence } from '@/lib/knowledge-base/actions'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import { buildRagContext, type RagChunk } from '@/lib/knowledge-base/rag'
import { repairLinkOnlyRagAnswer } from '@/lib/knowledge-base/rag-answer-repair'
import { microPolishDeterministicRagAnswer } from '@/lib/knowledge-base/rag-answer-micro-polish'
import { polishGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-polish'
import { generateGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-generate'
import { appendCanonicalRagSourceLinks } from '@/lib/knowledge-base/rag-source-links'

export const runtime = 'nodejs'

const MAX_MESSAGE_CHARS = 2000
const MAX_SESSION_ID_CHARS = 128
const DEFAULT_SYNC_REPLY_TIMEOUT_MS = 5000
const DEFAULT_FAST_RAG_REPLY_TIMEOUT_MS = 10000
const DEFAULT_FAST_RAG_GENERATE_TIMEOUT_MS = 3500
const DEFAULT_CONTEXTUAL_FAST_RAG_GENERATE_TIMEOUT_MS = 5500
const DEFAULT_FAST_RAG_POLISH_TIMEOUT_MS = 1800
const MAX_SYNC_REPLY_TIMEOUT_MS = 6000
const MAX_FAST_RAG_REPLY_TIMEOUT_MS = 12000
const MAX_FAST_RAG_GENERATE_TIMEOUT_MS = 5000
const MAX_CONTEXTUAL_FAST_RAG_GENERATE_TIMEOUT_MS = 8000
const MAX_FAST_RAG_POLISH_TIMEOUT_MS = 3000
const DEMO_CHAT_RATE_LIMIT_WINDOW_MS = 60 * 1000
const DEFAULT_DEMO_CHAT_RATE_LIMIT_PER_MINUTE = 20
const FAST_RAG_MATCH_THRESHOLD = 0.5
const FAST_RAG_RESULT_LIMIT = 6
const MAX_CONTEXTUAL_SEARCH_QUERY_CHARS = 500
const MIN_CONTEXTUAL_ANCHOR_TOKEN_COVERAGE = 2

type RouteContext = {
    params: Promise<{ slug: string }>
}

type DemoChatBody = {
    sessionId?: unknown
    message?: unknown
}

type DemoChatSkillImage = {
    imageUrl: string
    mimeType?: string | null
    fileName?: string | null
}

type DemoChatPipelineResult = {
    replyText: string
    skillImage: DemoChatSkillImage | null
}

type DemoChatMessageRow = {
    id?: string | null
    content: string | null
    metadata: Record<string, unknown> | null
}

type DemoChatHistoryMessageRow = DemoChatMessageRow & {
    sender_type: string | null
}

type DemoChatPendingInboundLookup = {
    message: DemoChatMessageRow | null
    conversationId: string | null
}

type DemoChatConversationRow = {
    id?: string | null
}

type DemoChatExtractiveReply = DemoChatPipelineResult & {
    chunks: RagChunk[]
    generation: {
        usedGeneration: boolean
        addedEngagement: boolean
        model: string
    } | null
    polish: {
        usedPolish: boolean
        addedEngagement: boolean
        model: string
    } | null
    diagnostics: DemoChatRagDiagnostics
}

type DemoChatRagDiagnostics = {
    search_strategy: 'focused' | 'broad' | 'contextual_focused' | 'contextual_broad'
    search_query_count: number
    retrieved_chunk_count: number
    deterministic_fast_path: boolean
    used_micro_polish: boolean
    timings_ms: Record<string, number>
}

const demoChatRateLimitBuckets = new Map<string, { windowStartMs: number; count: number }>()

function createServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase service-role configuration')
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    })
}

type DemoChatServiceClient = ReturnType<typeof createServiceClient>

function readTextReply(content: OutboundMessageInput) {
    if (isOutboundImageMessage(content)) return ''
    return normalizeOutboundMessage(content).content.trim()
}

function normalizeSessionId(value: unknown) {
    if (typeof value !== 'string') return ''
    return value.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, MAX_SESSION_ID_CHARS)
}

function readSyncReplyTimeoutMs() {
    const raw = Number.parseInt(process.env.DEMO_CHAT_SYNC_REPLY_TIMEOUT_MS ?? '', 10)
    if (Number.isFinite(raw) && raw >= 1000) return Math.min(raw, MAX_SYNC_REPLY_TIMEOUT_MS)
    return DEFAULT_SYNC_REPLY_TIMEOUT_MS
}

function readFastRagReplyTimeoutMs() {
    const raw = Number.parseInt(process.env.DEMO_CHAT_FAST_RAG_REPLY_TIMEOUT_MS ?? '', 10)
    if (Number.isFinite(raw) && raw >= 1000) return Math.min(raw, MAX_FAST_RAG_REPLY_TIMEOUT_MS)
    return DEFAULT_FAST_RAG_REPLY_TIMEOUT_MS
}

function readFastRagGenerateTimeoutMs() {
    const raw = Number.parseInt(process.env.DEMO_CHAT_FAST_RAG_GENERATE_TIMEOUT_MS ?? '', 10)
    if (Number.isFinite(raw) && raw >= 1000) return Math.min(raw, MAX_FAST_RAG_GENERATE_TIMEOUT_MS)
    return DEFAULT_FAST_RAG_GENERATE_TIMEOUT_MS
}

function readContextualFastRagGenerateTimeoutMs() {
    const raw = Number.parseInt(process.env.DEMO_CHAT_CONTEXTUAL_FAST_RAG_GENERATE_TIMEOUT_MS ?? '', 10)
    if (Number.isFinite(raw) && raw >= 1000) return Math.min(raw, MAX_CONTEXTUAL_FAST_RAG_GENERATE_TIMEOUT_MS)
    return DEFAULT_CONTEXTUAL_FAST_RAG_GENERATE_TIMEOUT_MS
}

function readFastRagPolishTimeoutMs() {
    const raw = Number.parseInt(process.env.DEMO_CHAT_FAST_RAG_POLISH_TIMEOUT_MS ?? '', 10)
    if (Number.isFinite(raw) && raw >= 750) return Math.min(raw, MAX_FAST_RAG_POLISH_TIMEOUT_MS)
    return DEFAULT_FAST_RAG_POLISH_TIMEOUT_MS
}

function readMessageText(value: unknown) {
    if (typeof value !== 'string') return ''
    return value.trim()
}

function normalizeDemoKnowledgeQuery(value: string) {
    return value.replace(/\s+/g, ' ').trim()
}

function demoKnowledgeQueryKey(value: string) {
    return normalizeDemoKnowledgeQuery(value).toLocaleLowerCase('tr-TR')
}

function hasDemoCompoundQuestionSignal(part: string) {
    const normalized = demoKnowledgeQueryKey(part)
    const tokenCount = (normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? []).length
    if (tokenCount < 3) return false

    return /\b(?:adres|anadal|başvuru|basvuru|çap|cap|çift|cift|ders|e-?posta|eğitim|egitim|final|hak|hangi|iletişim|iletisim|izin|kaç|kac|kampüs|kampus|kim|mail|mazeret|nerede|not|program|rapor|sınav|sinav|sorumlu|staj|telefon|var mı|var mi|yapabilir)\b/iu.test(normalized)
}

function findDemoSharedPredicateIndex(part: string) {
    const tokens = part.split(/\s+/u).filter(Boolean)
    return tokens.findIndex((token, index) => {
        if (index === 0) return false
        const normalizedToken = token.replace(/[^\p{L}\p{N}-]/gu, '')
        return /^(?:adres|anadal|başvuru|basvuru|çap|cap|çift|cift|ders|e-?posta|eğitim|egitim|final|hak|hangi|iletişim|iletisim|izin|kaç|kac|kampüs|kampus|kim|mail|mazeret|nerede|not|program|rapor|sınav|sinav|sorumlu|staj|telefon|var|yapabilir)/iu.test(normalizedToken)
    })
}

function splitDemoSharedPredicateCompoundQueries(trimmed: string, hasQuestionMark: boolean) {
    const rawParts = trimmed
        .replace(/[?？]\s*$/u, '')
        .split(/\s+(?:ve|ayrıca|ayrica|and)\s+/iu)
        .map((part) => part.trim())
        .filter(Boolean)
    if (rawParts.length < 2) return []

    const lastPart = rawParts[rawParts.length - 1] ?? ''
    const lastTokens = lastPart.split(/\s+/u).filter(Boolean)
    const predicateIndex = findDemoSharedPredicateIndex(lastPart)
    if (predicateIndex <= 0) return []

    const lastEntity = lastTokens.slice(0, predicateIndex).join(' ').trim()
    const sharedPredicate = lastTokens.slice(predicateIndex).join(' ').trim()
    if (!lastEntity || !sharedPredicate) return []

    const entityParts = [
        ...rawParts.slice(0, -1),
        lastEntity
    ]

    const seen = new Set<string>()
    const queries = entityParts
        .map((entity) => `${entity} ${sharedPredicate}`.trim())
        .map((query) => hasQuestionMark && !/[?？]\s*$/.test(query) ? `${query}?` : query)
        .filter(hasDemoCompoundQuestionSignal)
        .filter((query) => {
            const key = demoKnowledgeQueryKey(query)
            if (!key || seen.has(key)) return false
            seen.add(key)
            return true
        })

    return queries.length >= 2 ? queries : []
}

function splitDemoCompoundKnowledgeQueries(message: string) {
    const trimmed = normalizeDemoKnowledgeQuery(message)
    if (!/\s+(?:ve|ayrıca|ayrica|and)\s+/iu.test(trimmed)) return []

    const hasQuestionMark = /[?？]\s*$/.test(trimmed)
    const parts = trimmed
        .replace(/[?？]\s*$/u, '')
        .split(/\s+(?:ve|ayrıca|ayrica|and)\s+/iu)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => hasQuestionMark && !/[?？]\s*$/.test(part) ? `${part}?` : part)
        .filter(hasDemoCompoundQuestionSignal)

    if (parts.length >= 2) return parts

    return splitDemoSharedPredicateCompoundQueries(trimmed, hasQuestionMark)
}

function buildDemoKnowledgeSearchQueries(message: string) {
    const queries = [
        normalizeDemoKnowledgeQuery(message),
        ...splitDemoCompoundKnowledgeQueries(message)
    ]
    const seen = new Set<string>()

    return queries.filter((query) => {
        const key = demoKnowledgeQueryKey(query)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function truncateDemoKnowledgeQuery(value: string) {
    const normalized = normalizeDemoKnowledgeQuery(value)
    if (normalized.length <= MAX_CONTEXTUAL_SEARCH_QUERY_CHARS) return normalized
    return normalized.slice(0, MAX_CONTEXTUAL_SEARCH_QUERY_CHARS).trim()
}

function buildDemoContextualKnowledgeSearchQueries(
    message: string,
    conversationHistory: KnowledgeSearchPlanningTurn[]
) {
    const normalizedMessage = normalizeDemoKnowledgeQuery(message)
    const previousUserTurns = conversationHistory
        .filter((turn) => turn.role === 'user')
        .map((turn) => normalizeDemoKnowledgeQuery(turn.content))
        .filter((content) => content && demoKnowledgeQueryKey(content) !== demoKnowledgeQueryKey(normalizedMessage))
        .filter((content) => !shouldUseDemoConversationHistoryForRag(content))
        .slice(-2)
        .reverse()

    const contextualQueries = previousUserTurns.map((previousQuestion) => (
        truncateDemoKnowledgeQuery(`${previousQuestion} ${normalizedMessage}`)
    ))

    const queries = [
        ...contextualQueries,
        ...buildDemoKnowledgeSearchQueries(message)
    ]
    const seen = new Set<string>()

    return queries.filter((query) => {
        const key = demoKnowledgeQueryKey(query)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function normalizeDemoAnchorText(value: string) {
    return value
        .toLocaleLowerCase('tr-TR')
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => ({
            ı: 'i',
            İ: 'i',
            ğ: 'g',
            Ğ: 'g',
            ü: 'u',
            Ü: 'u',
            ş: 's',
            Ş: 's',
            ö: 'o',
            Ö: 'o',
            ç: 'c'
        }[char] ?? char))
}

function extractDemoAnchorTokens(value: string) {
    const stopwords = new Set([
        'acaba',
        'bilgi',
        'bolum',
        'ders',
        'egitim',
        'fakulte',
        'hangi',
        'hakkinda',
        'icin',
        'is',
        'kac',
        'kampus',
        'konu',
        'misin',
        'miyim',
        'nerede',
        'program',
        'sinav',
        'staj',
        'sure',
        'var',
        'yaz',
        'yerleske',
        'gunu'
    ])

    return Array.from(new Set(normalizeDemoAnchorText(value)
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4)
        .filter((token) => !stopwords.has(token))))
}

function historyAnchorTokenGroups(conversationHistory: KnowledgeSearchPlanningTurn[]) {
    const latestAnchorTokens = [...conversationHistory]
        .reverse()
        .filter((turn) => turn.role === 'user')
        .map((turn) => normalizeDemoKnowledgeQuery(turn.content))
        .filter((content) => content && !shouldUseDemoConversationHistoryForRag(content))
        .map(extractDemoAnchorTokens)
        .find((tokens) => tokens.length >= MIN_CONTEXTUAL_ANCHOR_TOKEN_COVERAGE)

    return latestAnchorTokens ? [latestAnchorTokens] : []
}

function contextualChunkMatchesHistoryAnchor(chunk: RagChunk, anchors: string[][]) {
    const searchable = normalizeDemoAnchorText([
        chunk.document_title ?? '',
        chunk.source_url ?? '',
        chunk.content ?? ''
    ].join('\n'))

    return anchors.some((tokens) => (
        tokens.filter((token) => searchable.includes(token)).length >= MIN_CONTEXTUAL_ANCHOR_TOKEN_COVERAGE
    ))
}

function filterChunksByHistoryAnchor(
    chunks: RagChunk[],
    conversationHistory: KnowledgeSearchPlanningTurn[]
) {
    const anchors = historyAnchorTokenGroups(conversationHistory)
    if (anchors.length === 0) return chunks

    return chunks.filter((chunk) => contextualChunkMatchesHistoryAnchor(chunk, anchors))
}

function contextualChunksContainHistoryAnchor(
    chunks: RagChunk[],
    conversationHistory: KnowledgeSearchPlanningTurn[]
) {
    const anchors = historyAnchorTokenGroups(conversationHistory)
    if (anchors.length === 0) return false

    return chunks.some((chunk) => contextualChunkMatchesHistoryAnchor(chunk, anchors))
}

function demoRagChunkKey(chunk: RagChunk) {
    return chunk.chunk_id
        ?? `${chunk.document_id ?? 'unknown'}:${chunk.content.replace(/\s+/g, ' ').trim().slice(0, 180)}`
}

function mergeDemoRagResultGroups(groups: RagChunk[][], limit: number) {
    const seen = new Set<string>()
    const merged: RagChunk[] = []

    for (const group of groups) {
        for (const chunk of group) {
            const key = demoRagChunkKey(chunk)
            if (seen.has(key)) continue
            seen.add(key)
            merged.push(chunk)
            if (merged.length >= limit) return merged
        }
    }

    return merged
}

function readDemoChatAccessToken(req: NextRequest) {
    const authorization = req.headers.get('authorization')?.trim()
    if (authorization?.toLowerCase().startsWith('bearer ')) {
        return authorization.slice('bearer '.length).trim()
    }

    return req.headers.get('x-demo-chat-access-token')?.trim() || null
}

function isDemoChatRequestAuthorized(
    req: NextRequest,
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
) {
    return verifyDemoChatAccessToken({
        channel,
        token: readDemoChatAccessToken(req),
    })
}

function readDemoChatRateLimitMax() {
    const raw = Number.parseInt(process.env.DEMO_CHAT_RATE_LIMIT_PER_MINUTE ?? '', 10)
    if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 120)
    return DEFAULT_DEMO_CHAT_RATE_LIMIT_PER_MINUTE
}

function readClientIp(req: NextRequest) {
    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    return forwardedFor || req.headers.get('x-real-ip')?.trim() || 'unknown'
}

function pruneDemoChatRateLimitBuckets(nowMs: number) {
    if (demoChatRateLimitBuckets.size < 1000) return

    for (const [key, bucket] of demoChatRateLimitBuckets.entries()) {
        if (nowMs - bucket.windowStartMs >= DEMO_CHAT_RATE_LIMIT_WINDOW_MS) {
            demoChatRateLimitBuckets.delete(key)
        }
    }
}

function isDemoChatRateLimited(input: {
    req: NextRequest
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
    sessionId: string
}) {
    const nowMs = Date.now()
    pruneDemoChatRateLimitBuckets(nowMs)

    const key = `${input.channel.id}:${input.sessionId}:${readClientIp(input.req)}`
    const current = demoChatRateLimitBuckets.get(key)
    if (!current || nowMs - current.windowStartMs >= DEMO_CHAT_RATE_LIMIT_WINDOW_MS) {
        demoChatRateLimitBuckets.set(key, { windowStartMs: nowMs, count: 1 })
        return false
    }

    current.count += 1
    return current.count > readDemoChatRateLimitMax()
}

function waitForPipelineResult<T>(promise: Promise<T>, timeoutMs: number) {
    return new Promise<
        | { status: 'completed'; result: T }
        | { status: 'timeout' }
    >((resolve, reject) => {
        const timeoutId = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs)

        promise.then((result) => {
            clearTimeout(timeoutId)
            resolve({ status: 'completed', result })
        }).catch((error) => {
            clearTimeout(timeoutId)
            reject(error)
        })
    })
}

function elapsedMs(startedAt: number) {
    return Math.max(0, Date.now() - startedAt)
}

function readMetadataString(metadata: Record<string, unknown> | null, key: string) {
    const value = metadata?.[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readMetadataRecord(metadata: Record<string, unknown> | null, key: string) {
    const value = metadata?.[key]
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function readSkillImageFromMessageMetadata(metadata: Record<string, unknown> | null): DemoChatSkillImage | null {
    const media = readMetadataRecord(metadata, 'demo_chat_media')
    const imageUrl = readMetadataString(media, 'storage_url')
    if (!imageUrl) return null

    return {
        imageUrl,
        mimeType: readMetadataString(media, 'mime_type'),
        fileName: readMetadataString(media, 'filename')
    }
}

function buildNoInformationSeed(responseLanguage: MvpResponseLanguage) {
    return responseLanguage === 'tr'
        ? 'Bu konuda elimde net bilgi yok.'
        : 'I do not have clear information about this in the knowledge base.'
}

function responseContainsNoAnswer(value: unknown): boolean {
    if (typeof value === 'string') return /\bno_answer\b|bu konuda elimde net bilgi yok|do not have clear information/i.test(value)
    if (Array.isArray(value)) return value.some(responseContainsNoAnswer)
    if (value && typeof value === 'object') return Object.values(value).some(responseContainsNoAnswer)
    return false
}

function isNoAnswerReply(response: string | null | undefined) {
    const trimmed = response?.trim()
    if (!trimmed) return true
    if (responseContainsNoAnswer(trimmed)) return true

    try {
        return responseContainsNoAnswer(JSON.parse(trimmed))
    } catch {
        return false
    }
}

function shouldUseDemoConversationHistoryForRag(message: string) {
    const normalized = message
        .toLocaleLowerCase('tr-TR')
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()

    return /\b(?:bu|su|o|ayni)\s+(?:program|bolum|fakulte|kampus|yerleske|ders|sinav|konu|belge|dokuman|yonetmelik|surec|birim)\b/u.test(normalized)
        || /\b(?:bu|su|o)\s+(?:programda|bolumde|fakultede|kampuste|yerleskede|derste|sinavda|konuda|belgede|dokumanda|yonetmelikte|surecte|birimde)\b/u.test(normalized)
        || /\b(?:bunda|bundaki|ondaki|orada|burada|bunun|onun|az onceki|onceki)\b/u.test(normalized)
}

async function runDemoChatPipeline(input: {
    supabase: DemoChatServiceClient
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
    sessionId: string
    message: string
    inboundMessageId: string
    reprocessExistingInbound?: boolean
}): Promise<DemoChatPipelineResult> {
    const { supabase, channel, sessionId, message, inboundMessageId, reprocessExistingInbound } = input
    let replyText = ''
    let skillImage: DemoChatSkillImage | null = null

    await processInboundAiPipeline({
        supabase,
        organizationId: channel.organizationId,
        platform: 'demo_chat',
        source: 'demo_chat',
        contactId: buildDemoChatContactId(channel.id, sessionId),
        contactName: 'Demo ziyaretçi',
        text: message,
        inboundMessageId,
        inboundMessageIdMetadataKey: 'demo_chat_message_id',
        inboundMessageMetadata: {
            demo_chat_message_id: inboundMessageId,
            demo_chat_channel_id: channel.id,
            demo_chat_slug: channel.slug,
            demo_chat_session_id: sessionId,
        },
        reprocessExistingInbound,
        sendOutbound: async (content) => {
            const isImage = isOutboundImageMessage(content)
            const text = readTextReply(content)
            if (text) replyText = text

            if (isImage) {
                skillImage = {
                    imageUrl: content.imageUrl,
                    mimeType: content.mimeType,
                    fileName: content.fileName,
                }
            }

            return {
                providerMetadata: {
                    demo_chat_reply_to_message_id: inboundMessageId,
                    demo_chat_reply_kind: isImage ? 'image' : 'text'
                }
            }
        },
        logPrefix: 'Demo Chat',
    })

    return { replyText, skillImage }
}

async function findCompletedDemoChatReply(input: {
    supabase: DemoChatServiceClient
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
    sessionId: string
    messageId: string
}): Promise<DemoChatPipelineResult | null> {
    const contactId = buildDemoChatContactId(input.channel.id, input.sessionId)
    const { data: conversation, error: conversationError } = await input.supabase
        .from('conversations')
        .select('id')
        .eq('organization_id', input.channel.organizationId)
        .eq('platform', 'demo_chat')
        .eq('contact_phone', contactId)
        .maybeSingle()

    if (conversationError) throw conversationError

    const conversationRow = conversation as DemoChatConversationRow | null
    if (!conversationRow?.id) return null

    const { data: messages, error: messagesError } = await input.supabase
        .from('messages')
        .select('content, metadata')
        .eq('conversation_id', conversationRow.id)
        .eq('sender_type', 'bot')
        .eq('metadata->>demo_chat_reply_to_message_id', input.messageId)
        .order('created_at', { ascending: true })

    if (messagesError) throw messagesError

    const rows = (messages ?? []) as DemoChatMessageRow[]
    if (rows.length === 0) return null

    const replyText = rows
        .map((message) => message.content?.trim() ?? '')
        .filter((content) => content && !/^\[[^\]]+\]$/.test(content))
        .at(-1) ?? ''
    const skillImage = rows
        .map((message) => readSkillImageFromMessageMetadata(message.metadata))
        .find((image): image is DemoChatSkillImage => Boolean(image))

    return {
        replyText,
        skillImage: skillImage ?? null
    }
}

async function findDemoChatConversationId(input: {
    supabase: DemoChatServiceClient
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
    sessionId: string
}) {
    const contactId = buildDemoChatContactId(input.channel.id, input.sessionId)
    const { data: conversation, error: conversationError } = await input.supabase
        .from('conversations')
        .select('id')
        .eq('organization_id', input.channel.organizationId)
        .eq('platform', 'demo_chat')
        .eq('contact_phone', contactId)
        .maybeSingle()

    if (conversationError) throw conversationError

    const conversationRow = conversation as DemoChatConversationRow | null
    return conversationRow?.id ?? null
}

async function findPendingDemoChatInboundMessage(input: {
    supabase: DemoChatServiceClient
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
    sessionId: string
    messageId: string
}): Promise<DemoChatPendingInboundLookup> {
    const contactId = buildDemoChatContactId(input.channel.id, input.sessionId)
    const { data: conversation, error: conversationError } = await input.supabase
        .from('conversations')
        .select('id')
        .eq('organization_id', input.channel.organizationId)
        .eq('platform', 'demo_chat')
        .eq('contact_phone', contactId)
        .maybeSingle()

    if (conversationError) throw conversationError

    const conversationRow = conversation as DemoChatConversationRow | null
    if (!conversationRow?.id) return { message: null, conversationId: null }

    const { data: message, error: messageError } = await input.supabase
        .from('messages')
        .select('id, content')
        .eq('conversation_id', conversationRow.id)
        .eq('sender_type', 'contact')
        .eq('metadata->>demo_chat_message_id', input.messageId)
        .maybeSingle()

    if (messageError) throw messageError

    return {
        message: (message ?? null) as DemoChatMessageRow | null,
        conversationId: conversationRow.id
    }
}

async function readRecentDemoChatHistory(input: {
    supabase: DemoChatServiceClient
    conversationId: string | null
    messageId: string
}): Promise<KnowledgeSearchPlanningTurn[]> {
    if (!input.conversationId) return []

    const { data: messages, error } = await input.supabase
        .from('messages')
        .select('content, sender_type, metadata')
        .eq('conversation_id', input.conversationId)
        .order('created_at', { ascending: false })
        .limit(8)

    if (error) throw error

    return ((messages ?? []) as DemoChatHistoryMessageRow[])
        .filter((message) => {
            const metadata = message.metadata ?? {}
            return metadata.demo_chat_message_id !== input.messageId
                && metadata.demo_chat_reply_to_message_id !== input.messageId
        })
        .reverse()
        .map((message) => {
            const content = message.content?.trim() ?? ''
            const role = message.sender_type === 'bot' ? 'assistant' : 'user'
            return { role, content } satisfies KnowledgeSearchPlanningTurn
        })
        .filter((turn) => turn.content && !/^\[[^\]]+\]$/.test(turn.content))
        .slice(-6)
}

async function ingestDemoChatInboundOnly(input: {
    supabase: DemoChatServiceClient
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
    sessionId: string
    message: string
    inboundMessageId: string
}) {
    await processInboundAiPipeline({
        supabase: input.supabase,
        organizationId: input.channel.organizationId,
        platform: 'demo_chat',
        source: 'demo_chat',
        contactId: buildDemoChatContactId(input.channel.id, input.sessionId),
        contactName: 'Demo ziyaretçi',
        text: input.message,
        inboundMessageId: input.inboundMessageId,
        inboundMessageIdMetadataKey: 'demo_chat_message_id',
        inboundMessageMetadata: {
            demo_chat_message_id: input.inboundMessageId,
            demo_chat_channel_id: input.channel.id,
            demo_chat_slug: input.channel.slug,
            demo_chat_session_id: input.sessionId,
        },
        skipAutomation: true,
        sendOutbound: async () => undefined,
        logPrefix: 'Demo Chat',
    })
}

async function buildExtractiveDemoChatReply(input: {
    supabase: DemoChatServiceClient
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
    message: string
    conversationHistory?: KnowledgeSearchPlanningTurn[]
}): Promise<DemoChatExtractiveReply | null> {
    const message = readMessageText(input.message)
    if (!message) return null
    const conversationHistory = input.conversationHistory ?? []
    const replyStartedAt = Date.now()

    const buildReplyFromResults = async (
        kbResults: RagChunk[],
        searchDiagnostics: Omit<DemoChatRagDiagnostics, 'retrieved_chunk_count' | 'deterministic_fast_path' | 'used_micro_polish'>
    ): Promise<DemoChatExtractiveReply | null> => {
        const buildStartedAt = Date.now()
        if (!kbResults || kbResults.length === 0) return null
        const buildDiagnostics = (input: {
            deterministicFastPath: boolean
            usedMicroPolish: boolean
            timingsMs?: Record<string, number>
        }): DemoChatRagDiagnostics => ({
            ...searchDiagnostics,
            retrieved_chunk_count: kbResults.length,
            deterministic_fast_path: input.deterministicFastPath,
            used_micro_polish: input.usedMicroPolish,
            timings_ms: {
                ...searchDiagnostics.timings_ms,
                ...(input.timingsMs ?? {}),
                build_reply: elapsedMs(buildStartedAt),
                total: elapsedMs(replyStartedAt)
            }
        })

        const anchoredResults = hasConversationHistory
            ? filterChunksByHistoryAnchor(kbResults, conversationHistory)
            : kbResults
        if (hasConversationHistory && anchoredResults.length === 0) return null

        const { context, chunks } = buildRagContext(anchoredResults)
        if (!context || chunks.length === 0) return null

        const responseLanguage = resolveMvpResponseLanguage(message)

        if (hasConversationHistory && !contextualChunksContainHistoryAnchor(chunks, conversationHistory)) {
            return null
        }

        const noInformationSeed = buildNoInformationSeed(responseLanguage)
        const repairedAnswer = repairLinkOnlyRagAnswer({
            response: noInformationSeed,
            userMessage: message,
            responseLanguage,
            chunks
        })
        const hasDeterministicAnswer = Boolean(
            repairedAnswer
            && repairedAnswer !== noInformationSeed
            && !isNoAnswerReply(repairedAnswer)
        )

        if (hasDeterministicAnswer && repairedAnswer) {
            const microPolishedAnswer = microPolishDeterministicRagAnswer({
                answer: repairedAnswer,
                userMessage: message,
                responseLanguage,
                chunks
            })
            return {
                replyText: appendCanonicalRagSourceLinks(microPolishedAnswer.answer, chunks, {
                    force: true,
                    limit: 2
                }),
                skillImage: null,
                chunks,
                generation: null,
                polish: null,
                diagnostics: buildDiagnostics({
                    deterministicFastPath: true,
                    usedMicroPolish: microPolishedAnswer.usedMicroPolish
                })
            }
        }

        const settingsStartedAt = Date.now()
        const aiSettings = await getOrgAiSettings(input.channel.organizationId, {
            supabase: input.supabase,
            locale: responseLanguage
        })
        const settingsMs = elapsedMs(settingsStartedAt)

        const generationStartedAt = Date.now()
        const generatedAnswer = await generateGroundedRagAnswer({
            userMessage: message,
            responseLanguage,
            chunks,
            settings: aiSettings,
            conversationHistory,
            timeoutMs: hasConversationHistory
                ? readContextualFastRagGenerateTimeoutMs()
                : readFastRagGenerateTimeoutMs()
        })
        const generationMs = elapsedMs(generationStartedAt)

        if (generatedAnswer.usage) {
            try {
                await recordAiUsage({
                    organizationId: input.channel.organizationId,
                    category: 'rag',
                    model: generatedAnswer.model,
                    inputTokens: generatedAnswer.usage.inputTokens,
                    outputTokens: generatedAnswer.usage.outputTokens,
                    totalTokens: generatedAnswer.usage.totalTokens,
                    metadata: {
                        source: 'demo_chat_rag_generate',
                        response_kind: 'rag_grounded_generate',
                        demo_chat_channel_id: input.channel.id,
                        document_count: chunks.length
                    },
                    supabase: input.supabase
                })
            } catch (error) {
                console.error('Demo Chat: grounded RAG generation usage recording failed; continuing reply flow', error)
            }
        }

        if (generatedAnswer.usedGeneration && generatedAnswer.answer.trim() && !isNoAnswerReply(generatedAnswer.answer)) {
            const repairedGeneratedAnswer = repairLinkOnlyRagAnswer({
                response: generatedAnswer.answer,
                userMessage: message,
                responseLanguage,
                chunks
            })
            const generatedAnswerWasRepaired = Boolean(
                repairedGeneratedAnswer
                && !isNoAnswerReply(repairedGeneratedAnswer)
                && repairedGeneratedAnswer.trim() !== generatedAnswer.answer.trim()
            )
            let generatedAnswerForReply = repairedGeneratedAnswer && !isNoAnswerReply(repairedGeneratedAnswer)
                ? repairedGeneratedAnswer
                : generatedAnswer.answer
            let generatedPolishMetadata = {
                usedPolish: false,
                addedEngagement: false,
                model: generatedAnswer.model
            }

            if (!generatedAnswer.addedEngagement || generatedAnswerWasRepaired) {
                const polishedGeneratedAnswer = await polishGroundedRagAnswer({
                    answer: generatedAnswerForReply,
                    userMessage: message,
                    responseLanguage,
                    chunks,
                    settings: aiSettings,
                    timeoutMs: readFastRagPolishTimeoutMs()
                })

                if (polishedGeneratedAnswer.usage) {
                    try {
                        await recordAiUsage({
                            organizationId: input.channel.organizationId,
                            category: 'rag',
                            model: polishedGeneratedAnswer.model,
                            inputTokens: polishedGeneratedAnswer.usage.inputTokens,
                            outputTokens: polishedGeneratedAnswer.usage.outputTokens,
                            totalTokens: polishedGeneratedAnswer.usage.totalTokens,
                            metadata: {
                                source: 'demo_chat_rag_generate_polish',
                                response_kind: 'rag_grounded_generate_polish',
                                demo_chat_channel_id: input.channel.id,
                                document_count: chunks.length
                            },
                            supabase: input.supabase
                        })
                    } catch (error) {
                        console.error('Demo Chat: generated RAG polish usage recording failed; continuing reply flow', error)
                    }
                }

                generatedPolishMetadata = {
                    usedPolish: polishedGeneratedAnswer.usedPolish,
                    addedEngagement: polishedGeneratedAnswer.addedEngagement,
                    model: polishedGeneratedAnswer.model
                }

                if (
                    polishedGeneratedAnswer.usedPolish
                    && polishedGeneratedAnswer.answer.trim()
                    && !isNoAnswerReply(polishedGeneratedAnswer.answer)
                ) {
                    const repairedPolishedGeneratedAnswer = repairLinkOnlyRagAnswer({
                        response: polishedGeneratedAnswer.answer,
                        userMessage: message,
                        responseLanguage,
                        chunks
                    })
                    generatedAnswerForReply = repairedPolishedGeneratedAnswer && !isNoAnswerReply(repairedPolishedGeneratedAnswer)
                        ? repairedPolishedGeneratedAnswer
                        : polishedGeneratedAnswer.answer
                }
            }

            return {
                replyText: appendCanonicalRagSourceLinks(generatedAnswerForReply, chunks, {
                    force: true,
                    limit: 2
                }),
                skillImage: null,
                chunks,
                generation: {
                    usedGeneration: generatedAnswer.usedGeneration,
                    addedEngagement: generatedAnswer.addedEngagement,
                    model: generatedAnswer.model
                },
                polish: generatedPolishMetadata,
                diagnostics: buildDiagnostics({
                    deterministicFastPath: false,
                    usedMicroPolish: false,
                    timingsMs: {
                        settings: settingsMs,
                        generation: generationMs
                    }
                })
            }
        }

        if (!repairedAnswer || repairedAnswer === noInformationSeed || isNoAnswerReply(repairedAnswer)) return null

        const polishedAnswer = await polishGroundedRagAnswer({
            answer: repairedAnswer,
            userMessage: message,
            responseLanguage,
            chunks,
            settings: aiSettings,
            timeoutMs: readFastRagPolishTimeoutMs()
        })

        if (polishedAnswer.usage) {
            try {
                await recordAiUsage({
                    organizationId: input.channel.organizationId,
                    category: 'rag',
                    model: polishedAnswer.model,
                    inputTokens: polishedAnswer.usage.inputTokens,
                    outputTokens: polishedAnswer.usage.outputTokens,
                    totalTokens: polishedAnswer.usage.totalTokens,
                    metadata: {
                        source: 'demo_chat_rag_polish',
                        demo_chat_channel_id: input.channel.id,
                        document_count: chunks.length
                    },
                    supabase: input.supabase
                })
            } catch (error) {
                console.error('Demo Chat: RAG polish usage recording failed; continuing reply flow', error)
            }
        }

        const repairedPolishedAnswer = repairLinkOnlyRagAnswer({
            response: polishedAnswer.answer,
            userMessage: message,
            responseLanguage,
            chunks
        })
        const answerForSources = repairedPolishedAnswer && !isNoAnswerReply(repairedPolishedAnswer)
            ? repairedPolishedAnswer
            : polishedAnswer.answer

        return {
            replyText: appendCanonicalRagSourceLinks(answerForSources, chunks, {
                force: true,
                limit: 2
            }),
            skillImage: null,
            chunks,
            generation: null,
            polish: {
                usedPolish: polishedAnswer.usedPolish,
                addedEngagement: polishedAnswer.addedEngagement,
                model: polishedAnswer.model
            },
            diagnostics: buildDiagnostics({
                deterministicFastPath: false,
                usedMicroPolish: false,
                timingsMs: {
                    settings: settingsMs,
                    generation: generationMs
                }
            })
        }
    }

    const compoundSearchQueries = splitDemoCompoundKnowledgeQueries(message)
    const focusedSearchQueries = compoundSearchQueries.length > 0
        ? compoundSearchQueries
        : [message]
    const hasConversationHistory = conversationHistory.some((turn) => turn.content.trim())
    const searchFocusedQueries = async (
        queries: string[],
        strategy: DemoChatRagDiagnostics['search_strategy']
    ) => {
        const searchStartedAt = Date.now()
        const results = mergeDemoRagResultGroups(
            await Promise.all(queries.map((query) => searchKnowledgeBaseFocusedEvidence(
                query,
                input.channel.organizationId,
                FAST_RAG_RESULT_LIMIT,
                { supabase: input.supabase, plannerHistory: conversationHistory }
            ))),
            FAST_RAG_RESULT_LIMIT
        )

        return buildReplyFromResults(results, {
            search_strategy: strategy,
            search_query_count: queries.length,
            timings_ms: {
                search: elapsedMs(searchStartedAt)
            }
        })
    }

    const buildBroadSearchReply = async () => {
        const searchQueries = hasConversationHistory
            ? buildDemoContextualKnowledgeSearchQueries(message, conversationHistory)
            : buildDemoKnowledgeSearchQueries(message)
        const searchStartedAt = Date.now()
        const kbResults = mergeDemoRagResultGroups(
            await Promise.all(searchQueries.map((query) => searchKnowledgeBase(
                query,
                input.channel.organizationId,
                FAST_RAG_MATCH_THRESHOLD,
                FAST_RAG_RESULT_LIMIT,
                { supabase: input.supabase, plannerHistory: conversationHistory }
            ))),
            FAST_RAG_RESULT_LIMIT
        )

        return buildReplyFromResults(kbResults, {
            search_strategy: hasConversationHistory ? 'contextual_broad' : 'broad',
            search_query_count: searchQueries.length,
            timings_ms: {
                search: elapsedMs(searchStartedAt)
            }
        })
    }

    if (hasConversationHistory) {
        const contextualFocusedReply = await searchFocusedQueries(
            buildDemoContextualKnowledgeSearchQueries(message, conversationHistory),
            'contextual_focused'
        )
        if (contextualFocusedReply) return contextualFocusedReply
        const broadReply = await buildBroadSearchReply()
        return broadReply
    }

    const focusedReply = await searchFocusedQueries(focusedSearchQueries, 'focused')
    if (focusedReply) return focusedReply

    return hasConversationHistory ? null : buildBroadSearchReply()
}

async function persistDemoChatExtractiveReply(input: {
    supabase: DemoChatServiceClient
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
    sessionId: string
    messageId: string
    reply: DemoChatExtractiveReply
}) {
    const conversationId = await findDemoChatConversationId(input)
    if (!conversationId) return false

    const { data: existingReply, error: existingReplyError } = await input.supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'bot')
        .eq('metadata->>demo_chat_reply_to_message_id', input.messageId)
        .eq('metadata->>demo_chat_reply_kind', 'text')
        .maybeSingle()

    if (existingReplyError) throw existingReplyError
    if ((existingReply as { id?: string } | null)?.id) return true

    const now = new Date().toISOString()
    const { error: insertError } = await input.supabase
        .from('messages')
        .insert({
            id: uuidv4(),
            conversation_id: conversationId,
            organization_id: input.channel.organizationId,
            sender_type: 'bot',
            content: input.reply.replyText,
            metadata: {
                demo_chat_reply_to_message_id: input.messageId,
                demo_chat_reply_kind: 'text',
                is_rag: true,
                rag_extractive: true,
                rag_generate: input.reply.generation,
                rag_polish: input.reply.polish,
                rag_diagnostics: input.reply.diagnostics,
                sources: input.reply.chunks.map((chunk) => chunk.document_id).filter(Boolean)
            }
        })

    if (insertError) throw insertError

    const { error: updateError } = await input.supabase
        .from('conversations')
        .update({
            last_message_at: now,
            updated_at: now
        })
        .eq('id', conversationId)

    if (updateError) throw updateError
    return true
}

async function recoverPendingDemoChatReplyExtractively(input: {
    supabase: DemoChatServiceClient
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
    sessionId: string
    messageId: string
    fallbackMessage: string
}): Promise<DemoChatPipelineResult | null> {
    const pendingInbound = await findPendingDemoChatInboundMessage(input)
    const inboundMessage = pendingInbound.message
    const message = (readMessageText(inboundMessage?.content) || input.fallbackMessage).slice(0, MAX_MESSAGE_CHARS)
    if (!message) return null
    const conversationHistory = shouldUseDemoConversationHistoryForRag(message)
        ? await readRecentDemoChatHistory({
            supabase: input.supabase,
            conversationId: pendingInbound.conversationId,
            messageId: input.messageId
        })
        : []

    const reply = await buildExtractiveDemoChatReply({
        supabase: input.supabase,
        channel: input.channel,
        message,
        conversationHistory
    })
    if (!reply) return null

    if (!inboundMessage?.id) {
        await ingestDemoChatInboundOnly({
            supabase: input.supabase,
            channel: input.channel,
            sessionId: input.sessionId,
            message,
            inboundMessageId: input.messageId
        })
    }

    await persistDemoChatExtractiveReply({
        supabase: input.supabase,
        channel: input.channel,
        sessionId: input.sessionId,
        messageId: input.messageId,
        reply
    })

    return {
        replyText: reply.replyText,
        skillImage: null
    }
}

async function recoverPendingDemoChatReply(input: {
    supabase: DemoChatServiceClient
    channel: NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>
    sessionId: string
    messageId: string
    fallbackMessage: string
}): Promise<DemoChatPipelineResult | null> {
    const pendingInbound = await findPendingDemoChatInboundMessage(input)
    const inboundMessage = pendingInbound.message
    const message = (readMessageText(inboundMessage?.content) || input.fallbackMessage).slice(0, MAX_MESSAGE_CHARS)
    if (!message) return null

    const recoveredReply = await runDemoChatPipeline({
        supabase: input.supabase,
        channel: input.channel,
        sessionId: input.sessionId,
        message,
        inboundMessageId: input.messageId,
        reprocessExistingInbound: Boolean(inboundMessage?.id)
    })

    if (recoveredReply.replyText || recoveredReply.skillImage) return recoveredReply
    return findCompletedDemoChatReply(input)
}

export async function POST(req: NextRequest, context: RouteContext) {
    let body: DemoChatBody
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const message = readMessageText(body.message)
    if (!message) {
        return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    if (message.length > MAX_MESSAGE_CHARS) {
        return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
    }

    const sessionId = normalizeSessionId(body.sessionId)
    if (!sessionId) {
        return NextResponse.json({ error: 'Session is required' }, { status: 400 })
    }

    const { slug } = await context.params
    const supabase = createServiceClient()
    const channel = await resolveDemoChatChannel({ supabase, slug })
    if (!channel) {
        return NextResponse.json({ error: 'Demo not found' }, { status: 404 })
    }
    if (!isDemoChatRequestAuthorized(req, channel)) {
        return NextResponse.json({ error: 'Demo access denied' }, { status: 401 })
    }
    if (isDemoChatRateLimited({ req, channel, sessionId })) {
        return NextResponse.json({ error: 'Demo rate limit exceeded' }, { status: 429 })
    }

    const inboundMessageId = uuidv4()
    return NextResponse.json({
        pending: true,
        messageId: inboundMessageId
    }, { status: 202 })
}

export async function GET(req: NextRequest, context: RouteContext) {
    const sessionId = normalizeSessionId(req.nextUrl.searchParams.get('sessionId'))
    const messageId = normalizeSessionId(req.nextUrl.searchParams.get('messageId'))
    const message = readMessageText(req.nextUrl.searchParams.get('message')).slice(0, MAX_MESSAGE_CHARS)
    if (!sessionId || !messageId) {
        return NextResponse.json({ error: 'Session and message id are required' }, { status: 400 })
    }

    const { slug } = await context.params
    const supabase = createServiceClient()
    const channel = await resolveDemoChatChannel({ supabase, slug })
    if (!channel) {
        return NextResponse.json({ error: 'Demo not found' }, { status: 404 })
    }
    if (!isDemoChatRequestAuthorized(req, channel)) {
        return NextResponse.json({ error: 'Demo access denied' }, { status: 401 })
    }

    try {
        const completedReply = await findCompletedDemoChatReply({
            supabase,
            channel,
            sessionId,
            messageId
        })

        if (!completedReply) {
            if (isDemoChatRateLimited({ req, channel, sessionId })) {
                return NextResponse.json({ error: 'Demo rate limit exceeded' }, { status: 429 })
            }

            const extractiveRecoveryPromise = recoverPendingDemoChatReplyExtractively({
                supabase,
                channel,
                sessionId,
                messageId,
                fallbackMessage: message
            })
            const extractiveRecoveryResult = await waitForPipelineResult(
                extractiveRecoveryPromise,
                readSyncReplyTimeoutMs()
            )
            if (extractiveRecoveryResult.status === 'timeout') {
                void extractiveRecoveryPromise.catch((error) => {
                    console.error('Demo Chat: Timed-out extractive pending reply recovery failed', error)
                })

                return NextResponse.json({ pending: true }, { status: 202 })
            }

            const extractiveReply = extractiveRecoveryResult.result
            if (extractiveReply?.replyText || extractiveReply?.skillImage) {
                return NextResponse.json({
                    pending: false,
                    response: extractiveReply.replyText,
                    skillImage: extractiveReply.skillImage
                })
            }

            const recoveryPromise = recoverPendingDemoChatReply({
                supabase,
                channel,
                sessionId,
                messageId,
                fallbackMessage: message
            })
            const recoveryResult = await waitForPipelineResult(
                recoveryPromise,
                readFastRagReplyTimeoutMs()
            )
            if (recoveryResult.status === 'timeout') {
                void recoveryPromise.catch((error) => {
                    console.error('Demo Chat: Timed-out pending reply recovery failed', error)
                })

                return NextResponse.json({ pending: true }, { status: 202 })
            }

            const recoveredReply = recoveryResult.result
            if (!recoveredReply) {
                return NextResponse.json({ pending: true }, { status: 202 })
            }

            return NextResponse.json({
                pending: false,
                response: recoveredReply.replyText,
                skillImage: recoveredReply.skillImage
            })
        }

        return NextResponse.json({
            pending: false,
            response: completedReply.replyText,
            skillImage: completedReply.skillImage
        })
    } catch (error) {
        console.error('Demo Chat: Failed to read pending reply', error)
        return NextResponse.json({ error: 'Demo chat reply lookup failed' }, { status: 502 })
    }
}
