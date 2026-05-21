import { after, NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import {
    isOutboundImageMessage,
    normalizeOutboundMessage,
    type OutboundMessageInput,
} from '@/lib/channels/outbound-message'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'
import { buildDemoChatContactId, resolveDemoChatChannel } from '@/lib/demo-chat/channel'

export const runtime = 'nodejs'

const MAX_MESSAGE_CHARS = 2000
const MAX_SESSION_ID_CHARS = 128
const DEFAULT_SYNC_REPLY_TIMEOUT_MS = 8000

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

function readMessageText(value: unknown) {
    if (typeof value !== 'string') return ''
    return value.trim()
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

    const inboundMessageId = uuidv4()
    const pipelinePromise = runDemoChatPipeline({
        supabase,
        channel,
        sessionId,
        message,
        inboundMessageId
    })

    try {
        const pipelineResult = await waitForPipelineResult(pipelinePromise, readSyncReplyTimeoutMs())
        if (pipelineResult.status === 'completed') {
            return NextResponse.json({
                response: pipelineResult.result.replyText,
                skillImage: pipelineResult.result.skillImage,
            })
        }
    } catch (error) {
        console.error('Demo Chat: Failed to process message', error)
        return NextResponse.json({ error: 'Demo chat failed' }, { status: 502 })
    }

    scheduleAfterResponse('message processing', async () => {
        await pipelinePromise
    })

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

    try {
        const completedReply = await findCompletedDemoChatReply({
            supabase,
            channel,
            sessionId,
            messageId
        })

        if (!completedReply) {
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
