import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Json } from '@/types/database'
import { InstagramClient } from '@/lib/instagram/client'
import { extractInstagramTextMessages, isValidMetaSignature } from '@/lib/instagram/webhook'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'

export const runtime = 'nodejs'

interface InstagramChannelRecord {
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

    if (mode !== 'subscribe' || !token || !challenge) {
        return NextResponse.json({ error: 'Invalid verification request' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: channel } = await supabase
        .from('channels')
        .select('id, config')
        .eq('type', 'instagram')
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

    const events = extractInstagramTextMessages(payload)
    if (events.length === 0) {
        return NextResponse.json({ ok: true })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const channelCache = new Map<string, InstagramChannelRecord>()
    const clientCache = new Map<string, InstagramClient>()

    for (const event of events) {
        let channel = channelCache.get(event.instagramBusinessAccountId)
        let client = clientCache.get(event.instagramBusinessAccountId)

        if (!channel) {
            const { data } = await supabase
                .from('channels')
                .select('id, organization_id, config')
                .eq('type', 'instagram')
                .eq('status', 'active')
                .eq('config->>instagram_business_account_id', event.instagramBusinessAccountId)
                .maybeSingle()

            if (!data) {
                console.warn('Instagram Webhook: Channel not found for business account id', event.instagramBusinessAccountId)
                continue
            }

            channel = data as InstagramChannelRecord
            const appSecret = readConfigString(channel.config, 'app_secret')
            const isValid = isValidMetaSignature(signatureHeader, rawBody, appSecret)
            if (!isValid) {
                console.warn('Instagram Webhook: Invalid signature')
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            }

            const pageAccessToken = readConfigString(channel.config, 'page_access_token')
            if (!pageAccessToken) {
                console.warn('Instagram Webhook: Missing page access token')
                continue
            }

            client = new InstagramClient(pageAccessToken)
            channelCache.set(event.instagramBusinessAccountId, channel)
            clientCache.set(event.instagramBusinessAccountId, client)
        }

        if (!channel || !client) continue

        await processInboundAiPipeline({
            supabase,
            organizationId: channel.organization_id,
            platform: 'instagram',
            source: 'instagram',
            contactId: event.contactId,
            contactName: event.contactName,
            text: event.text,
            inboundMessageId: event.messageId,
            inboundMessageIdMetadataKey: 'instagram_message_id',
            inboundMessageMetadata: {
                instagram_message_id: event.messageId,
                instagram_timestamp: event.timestamp,
                instagram_business_account_id: event.instagramBusinessAccountId
            },
            sendOutbound: async (content: string) => {
                await client.sendText({
                    instagramBusinessAccountId: event.instagramBusinessAccountId,
                    to: event.contactId,
                    text: content
                })
            },
            logPrefix: 'Instagram Webhook'
        })
    }

    return NextResponse.json({ ok: true })
}
