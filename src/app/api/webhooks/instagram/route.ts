import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Json } from '@/types/database'
import { InstagramClient } from '@/lib/instagram/client'
import { extractInstagramInboundEvents, isValidMetaSignature } from '@/lib/instagram/webhook'
import { normalizeOutboundMessage } from '@/lib/channels/outbound-message'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'
import { resolveMetaInstagramConnectionCandidate } from '@/lib/channels/meta-oauth'

export const runtime = 'nodejs'

interface InstagramChannelRecord {
    id: string
    organization_id: string
    config: Json
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function isInstagramWebhookDebugEnabled() {
    const value = process.env.INSTAGRAM_WEBHOOK_DEBUG
    if (!value) return false
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function summarizeInstagramPayloadShape(payload: unknown) {
    if (!isRecord(payload) || !Array.isArray(payload.entry)) {
        return {
            hasEntryArray: false
        }
    }

    const entryShapes = payload.entry
        .slice(0, 3)
        .map((entry) => {
            if (!isRecord(entry)) return { kind: 'non_record' }

            const changes = Array.isArray(entry.changes) ? entry.changes : []
            const changeFields = changes
                .map((change) => {
                    if (!isRecord(change)) return null
                    const field = change.field
                    return typeof field === 'string' ? field : null
                })
                .filter((field): field is string => Boolean(field))

            return {
                keys: Object.keys(entry).sort(),
                hasMessaging: Array.isArray(entry.messaging),
                hasStandby: Array.isArray(entry.standby),
                hasChanges: changes.length > 0,
                changeFields
            }
        })

    return {
        hasEntryArray: true,
        entryCount: payload.entry.length,
        entryShapes
    }
}

function channelLookupFilter(instagramAccountId: string) {
    return [
        `config->>instagram_business_account_id.eq.${instagramAccountId}`,
        `config->>instagram_user_id.eq.${instagramAccountId}`,
        `config->>instagram_app_scoped_id.eq.${instagramAccountId}`
    ].join(',')
}

async function findActiveInstagramChannelByAccountId(
    supabase: any,
    instagramAccountId: string
) {
    const { data } = await supabase
        .from('channels')
        .select('id, organization_id, config')
        .eq('type', 'instagram')
        .eq('status', 'active')
        .or(channelLookupFilter(instagramAccountId))
        .maybeSingle()

    return data as InstagramChannelRecord | null
}

async function reconcileChannelByInstagramAccountId(
    supabase: any,
    instagramAccountId: string
) {
    const { data: channels } = await supabase
        .from('channels')
        .select('id, organization_id, config')
        .eq('type', 'instagram')
        .eq('status', 'active')

    for (const row of channels ?? []) {
        const channel = row as InstagramChannelRecord
        const pageAccessToken = readConfigString(channel.config, 'page_access_token')
        if (!pageAccessToken) continue

        try {
            const candidate = await resolveMetaInstagramConnectionCandidate(pageAccessToken)
            if (!candidate) continue

            const isMatch =
                candidate.instagramBusinessAccountId === instagramAccountId
                || candidate.instagramAppScopedId === instagramAccountId

            if (!isMatch) continue

            const nextConfig = {
                ...asConfigRecord(channel.config),
                instagram_business_account_id: candidate.instagramBusinessAccountId,
                instagram_user_id: candidate.instagramBusinessAccountId,
                instagram_app_scoped_id: candidate.instagramAppScopedId,
                page_id: candidate.pageId,
                username: candidate.instagramUsername ?? readConfigString(channel.config, 'username')
            }

            await supabase
                .from('channels')
                .update({ config: nextConfig })
                .eq('id', channel.id)

            return {
                ...channel,
                config: nextConfig
            } as InstagramChannelRecord
        } catch (error) {
            console.warn('Instagram Webhook: Channel reconciliation failed for channel', channel.id, error)
        }
    }

    return null
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
    const debugEnabled = isInstagramWebhookDebugEnabled()
    const signatureHeader = req.headers.get('x-hub-signature-256')
    const rawBody = await req.text()

    let payload: unknown
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const events = extractInstagramInboundEvents(payload)
    if (events.length === 0) {
        if (debugEnabled) {
            console.info('Instagram Webhook: No extractable events', summarizeInstagramPayloadShape(payload))
        }
        return NextResponse.json({ ok: true })
    }

    if (debugEnabled) {
        const counts = events.reduce<Record<string, number>>((acc, event) => {
            const key = `${event.eventSource}:${event.eventType}`
            acc[key] = (acc[key] ?? 0) + 1
            return acc
        }, {})
        console.info('Instagram Webhook: Extracted inbound events', {
            event_count: events.length,
            counts
        })
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
            const directChannel = await findActiveInstagramChannelByAccountId(
                supabase,
                event.instagramBusinessAccountId
            )
            const resolvedChannel = directChannel || await reconcileChannelByInstagramAccountId(
                supabase,
                event.instagramBusinessAccountId
            )

            if (!resolvedChannel) {
                console.warn('Instagram Webhook: Channel not found for business account id', event.instagramBusinessAccountId)
                continue
            }

            channel = resolvedChannel
            const appSecret = process.env.META_INSTAGRAM_APP_SECRET
                || process.env.META_APP_SECRET
                || readConfigString(channel.config, 'app_secret')
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
                instagram_business_account_id: event.instagramBusinessAccountId,
                instagram_event_source: event.eventSource,
                instagram_event_type: event.eventType
            },
            skipAutomation: event.skipAutomation,
            sendOutbound: async (content) => {
                const normalized = normalizeOutboundMessage(content)
                await client.sendText({
                    instagramBusinessAccountId: event.instagramBusinessAccountId,
                    to: event.contactId,
                    text: normalized.content
                })
            },
            logPrefix: 'Instagram Webhook'
        })
    }

    return NextResponse.json({ ok: true })
}
