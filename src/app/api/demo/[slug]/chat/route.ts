import { NextRequest, NextResponse } from 'next/server'
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

type RouteContext = {
    params: Promise<{ slug: string }>
}

type DemoChatBody = {
    sessionId?: unknown
    message?: unknown
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

function readTextReply(content: OutboundMessageInput) {
    if (isOutboundImageMessage(content)) return ''
    return normalizeOutboundMessage(content).content.trim()
}

function normalizeSessionId(value: unknown) {
    if (typeof value !== 'string') return ''
    return value.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, MAX_SESSION_ID_CHARS)
}

export async function POST(req: NextRequest, context: RouteContext) {
    let body: DemoChatBody
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const message = typeof body.message === 'string' ? body.message.trim() : ''
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

    let replyText = ''
    let skillImage: { imageUrl: string; mimeType?: string | null; fileName?: string | null } | null = null
    const inboundMessageId = uuidv4()

    try {
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
            sendOutbound: async (content) => {
                const text = readTextReply(content)
                if (text) replyText = text

                if (isOutboundImageMessage(content)) {
                    skillImage = {
                        imageUrl: content.imageUrl,
                        mimeType: content.mimeType,
                        fileName: content.fileName,
                    }
                }

                return undefined
            },
            logPrefix: 'Demo Chat',
        })
    } catch (error) {
        console.error('Demo Chat: Failed to process message', error)
        return NextResponse.json({ error: 'Demo chat failed' }, { status: 502 })
    }

    return NextResponse.json({
        response: replyText,
        skillImage,
    })
}
