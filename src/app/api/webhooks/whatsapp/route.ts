import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Json } from '@/types/database'
import { WhatsAppClient } from '@/lib/whatsapp/client'
import { extractWhatsAppTextMessages, isValidMetaSignature } from '@/lib/whatsapp/webhook'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'

export const runtime = 'nodejs'

interface WhatsAppChannelRecord {
    id: string
    organization_id: string
    config: Json
}

function asConfigRecord(value: Json): Record<string, Json | undefined> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    return value as Record<string, Json | undefined>
}

function readConfigString(config: Json, key: string): string | null {
    const value = asConfigRecord(config)[key]
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export async function GET(req: NextRequest) {
    const mode = req.nextUrl.searchParams.get('hub.mode')
    const token = req.nextUrl.searchParams.get('hub.verify_token')
    const challenge = req.nextUrl.searchParams.get('hub.challenge')
    const globalVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()

    if (mode !== 'subscribe' || !token || !challenge) {
        return NextResponse.json({ error: 'Invalid verification request' }, { status: 400 })
    }

    if (globalVerifyToken && token === globalVerifyToken) {
        return new NextResponse(challenge, { status: 200 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: channel } = await supabase
        .from('channels')
        .select('id, config')
        .eq('type', 'whatsapp')
        .eq('status', 'active')
        .eq('config->>verify_token', token)
        .maybeSingle()

    if (!channel) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const nextConfig = {
        ...asConfigRecord(channel.config),
        webhook_verified_at: new Date().toISOString()
    }

    await supabase
        .from('channels')
        .update({ config: nextConfig })
        .eq('id', channel.id)

    return new NextResponse(challenge, { status: 200 })
}

export async function POST(req: NextRequest) {
    const signatureHeader = req.headers.get('x-hub-signature-256')
    const rawBody = await req.text()

    let payload: unknown
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const events = extractWhatsAppTextMessages(payload)
    if (events.length === 0) {
        return NextResponse.json({ ok: true })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const channelCache = new Map<string, WhatsAppChannelRecord>()
    const clientCache = new Map<string, WhatsAppClient>()

    for (const event of events) {
        let channel = channelCache.get(event.phoneNumberId)
        let client = clientCache.get(event.phoneNumberId)

        if (!channel) {
            const { data } = await supabase
                .from('channels')
                .select('id, organization_id, config')
                .eq('type', 'whatsapp')
                .eq('status', 'active')
                .eq('config->>phone_number_id', event.phoneNumberId)
                .maybeSingle()

            if (!data) {
                console.warn('WhatsApp Webhook: Channel not found for phone number id', event.phoneNumberId)
                continue
            }

            channel = data as WhatsAppChannelRecord
            const appSecret = process.env.META_APP_SECRET || readConfigString(channel.config, 'app_secret')
            const isValid = isValidMetaSignature(signatureHeader, rawBody, appSecret)
            if (!isValid) {
                console.warn('WhatsApp Webhook: Invalid signature')
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }

            const accessToken = readConfigString(channel.config, 'permanent_access_token')
            if (!accessToken) {
                console.warn('WhatsApp Webhook: Missing permanent access token')
                continue
            }

            client = new WhatsAppClient(accessToken)
            channelCache.set(event.phoneNumberId, channel)
            clientCache.set(event.phoneNumberId, client)
        }

        if (!channel || !client) continue

        await processInboundAiPipeline({
            supabase,
            organizationId: channel.organization_id,
            platform: 'whatsapp',
            source: 'whatsapp',
            contactId: event.contactPhone,
            contactName: event.contactName,
            text: event.text,
            inboundMessageId: event.messageId,
            inboundMessageIdMetadataKey: 'whatsapp_message_id',
            inboundMessageMetadata: {
                whatsapp_message_id: event.messageId,
                whatsapp_timestamp: event.timestamp,
                phone_number_id: event.phoneNumberId
            },
            sendOutbound: async (content: string) => {
                await client.sendText({
                    phoneNumberId: event.phoneNumberId,
                    to: event.contactPhone,
                    text: content
                })
            },
            logPrefix: 'WhatsApp Webhook'
        })
    }

    return NextResponse.json({ ok: true })
}
