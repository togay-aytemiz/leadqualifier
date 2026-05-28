import { after, NextRequest, NextResponse } from 'next/server'
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
import { buildRagContext, type RagChunk } from '@/lib/knowledge-base/rag'
import { repairLinkOnlyRagAnswer } from '@/lib/knowledge-base/rag-answer-repair'
import { polishGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-polish'
import { generateGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-generate'
import { appendCanonicalRagSourceLinks } from '@/lib/knowledge-base/rag-source-links'

export const runtime = 'nodejs'

const MAX_MESSAGE_CHARS = 2000
const MAX_SESSION_ID_CHARS = 128
const DEFAULT_SYNC_REPLY_TIMEOUT_MS = 8000
const DEFAULT_FAST_RAG_REPLY_TIMEOUT_MS = 22000
const DEMO_CHAT_RATE_LIMIT_WINDOW_MS = 60 * 1000
const DEFAULT_DEMO_CHAT_RATE_LIMIT_PER_MINUTE = 20
const FAST_RAG_MATCH_THRESHOLD = 0.5
const FAST_RAG_RESULT_LIMIT = 6

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
    }
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
    if (Number.isFinite(raw) && raw >= 1000) return raw
    return DEFAULT_SYNC_REPLY_TIMEOUT_MS
}

function readFastRagReplyTimeoutMs() {
    const raw = Number.parseInt(process.env.DEMO_CHAT_FAST_RAG_REPLY_TIMEOUT_MS ?? '', 10)
    if (Number.isFinite(raw) && raw >= 1000) return Math.min(raw, 28000)
    return DEFAULT_FAST_RAG_REPLY_TIMEOUT_MS
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

    return parts.length >= 2 ? parts : []
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

function scheduleAfterResponse(label: string, task: () => Promise<void>) {
    const runTask = async () => {
        try {
            await task()
        } catch (error) {
            console.error(`Demo Chat: Deferred ${label} failed`, error)
        }
    }

    try {
        after(runTask)
    } catch {
        void runTask()
    }
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
}): Promise<DemoChatMessageRow | null> {
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

    const { data: message, error: messageError } = await input.supabase
        .from('messages')
        .select('id, content')
        .eq('conversation_id', conversationRow.id)
        .eq('sender_type', 'contact')
        .eq('metadata->>demo_chat_message_id', input.messageId)
        .maybeSingle()

    if (messageError) throw messageError

    return (message ?? null) as DemoChatMessageRow | null
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
}): Promise<DemoChatExtractiveReply | null> {
    const message = readMessageText(input.message)
    if (!message) return null

    const buildReplyFromResults = async (kbResults: RagChunk[]): Promise<DemoChatExtractiveReply | null> => {
        if (!kbResults || kbResults.length === 0) return null

        const { context, chunks } = buildRagContext(kbResults)
        if (!context || chunks.length === 0) return null

        const responseLanguage = resolveMvpResponseLanguage(message)
        const aiSettings = await getOrgAiSettings(input.channel.organizationId, {
            supabase: input.supabase,
            locale: responseLanguage
        })

        const generatedAnswer = await generateGroundedRagAnswer({
            userMessage: message,
            responseLanguage,
            chunks,
            settings: aiSettings
        })

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
            return {
                replyText: appendCanonicalRagSourceLinks(generatedAnswer.answer, chunks, {
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
                polish: {
                    usedPolish: false,
                    addedEngagement: false,
                    model: generatedAnswer.model
                }
            }
        }

        const noInformationSeed = buildNoInformationSeed(responseLanguage)
        const repairedAnswer = repairLinkOnlyRagAnswer({
            response: noInformationSeed,
            userMessage: message,
            responseLanguage,
            chunks
        })
        if (!repairedAnswer || repairedAnswer === noInformationSeed || isNoAnswerReply(repairedAnswer)) return null

        const polishedAnswer = await polishGroundedRagAnswer({
            answer: repairedAnswer,
            userMessage: message,
            responseLanguage,
            chunks,
            settings: aiSettings
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
            }
        }
    }

    const compoundSearchQueries = splitDemoCompoundKnowledgeQueries(message)
    const focusedSearchQueries = compoundSearchQueries.length > 0
        ? compoundSearchQueries
        : [message]
    const focusedResults = mergeDemoRagResultGroups(
        await Promise.all(focusedSearchQueries.map((query) => searchKnowledgeBaseFocusedEvidence(
            query,
            input.channel.organizationId,
            FAST_RAG_RESULT_LIMIT,
            { supabase: input.supabase }
        ))),
        FAST_RAG_RESULT_LIMIT
    )
    const focusedReply = await buildReplyFromResults(focusedResults)
    if (focusedReply) return focusedReply

    const searchQueries = buildDemoKnowledgeSearchQueries(message)
    const kbResults = mergeDemoRagResultGroups(
        await Promise.all(searchQueries.map((query) => searchKnowledgeBase(
            query,
            input.channel.organizationId,
            FAST_RAG_MATCH_THRESHOLD,
            FAST_RAG_RESULT_LIMIT,
            { supabase: input.supabase }
        ))),
        FAST_RAG_RESULT_LIMIT
    )

    return buildReplyFromResults(kbResults)
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
    const inboundMessage = await findPendingDemoChatInboundMessage(input)
    const message = (readMessageText(inboundMessage?.content) || input.fallbackMessage).slice(0, MAX_MESSAGE_CHARS)
    if (!message) return null

    const reply = await buildExtractiveDemoChatReply({
        supabase: input.supabase,
        channel: input.channel,
        message
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
    const inboundMessage = await findPendingDemoChatInboundMessage(input)
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
                readFastRagReplyTimeoutMs()
            )
            if (extractiveRecoveryResult.status === 'timeout') {
                scheduleAfterResponse('extractive pending reply recovery', async () => {
                    await extractiveRecoveryPromise
                })

                return NextResponse.json({ pending: true }, { status: 202 })
            }

            const extractiveReply = extractiveRecoveryResult.result
            if (extractiveReply) {
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
            const recoveryResult = await waitForPipelineResult(recoveryPromise, readSyncReplyTimeoutMs())
            if (recoveryResult.status === 'timeout') {
                scheduleAfterResponse('pending reply recovery', async () => {
                    await recoveryPromise
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
