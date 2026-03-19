import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
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

interface InstagramContactIdentity {
    contactName: string | null
    username: string | null
    avatarUrl: string | null
}

interface InstagramBusinessIdentity {
    username: string | null
    avatarUrl: string | null
}

interface InstagramWebhookConversation {
    id: string
    contact_name: string | null
    contact_avatar_url: string | null
    contact_phone: string | null
    organization_id: string
    platform: 'instagram'
    unread_count: number | null
    tags: unknown
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

function readTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
}

function clearInstagramRequestTag(tags: unknown) {
    return readStringArray(tags).filter((tag) => tag.toLowerCase() !== 'instagram_request')
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
        `config->>page_id.eq.${instagramAccountId}`,
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
                candidate.pageId === instagramAccountId
                || candidate.instagramBusinessAccountId === instagramAccountId
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

async function markInstagramChannelWebhookVerified(
    supabase: any,
    channel: InstagramChannelRecord
) {
    if (readConfigString(channel.config, 'webhook_verified_at')) {
        return channel
    }

    const nextConfig = {
        ...asConfigRecord(channel.config),
        webhook_status: 'verified',
        webhook_subscription_error: null,
        webhook_verified_at: new Date().toISOString()
    }

    await supabase
        .from('channels')
        .update({ config: nextConfig })
        .eq('id', channel.id)

    return {
        ...channel,
        config: nextConfig
    } as InstagramChannelRecord
}

async function findInstagramConversationByContactId(
    supabase: any,
    organizationId: string,
    contactId: string
) {
    const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('platform', 'instagram')
        .eq('contact_phone', contactId)
        .limit(1)
        .maybeSingle()

    return data as InstagramWebhookConversation | null
}

async function findInstagramConversationByContactName(
    supabase: any,
    organizationId: string,
    contactName: string
) {
    const normalizedContactName = readTrimmedString(contactName)
    if (!normalizedContactName) return null

    const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('platform', 'instagram')
        .eq('contact_name', normalizedContactName)
        .limit(1)
        .maybeSingle()

    return data as InstagramWebhookConversation | null
}

async function instagramConversationHasMessages(
    supabase: any,
    conversationId: string
) {
    const { data } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .limit(1)
        .maybeSingle()

    return Boolean((data as { id?: string } | null)?.id)
}

async function deleteInstagramConversationById(
    supabase: any,
    conversationId: string
) {
    const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)

    if (error) {
        console.warn('Instagram Webhook: Failed to clean up empty duplicate conversation', {
            conversation_id: conversationId,
            error
        })
        return false
    }

    return true
}

async function ensureInstagramConversationForContact(
    supabase: any,
    organizationId: string,
    contactId: string,
    contactIdentity: InstagramContactIdentity
) {
    const fallbackNames = [
        contactIdentity.username,
        contactIdentity.contactName
    ]
        .map((value) => readTrimmedString(value))
        .filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index)

    let conversation = await findInstagramConversationByContactId(supabase, organizationId, contactId)
    let fallbackConversation: InstagramWebhookConversation | null = null

    for (const fallbackName of fallbackNames) {
        fallbackConversation = await findInstagramConversationByContactName(
            supabase,
            organizationId,
            fallbackName
        )
        if (fallbackConversation) break
    }

    if (conversation && fallbackConversation && conversation.id !== fallbackConversation.id) {
        const exactConversationHasMessages = await instagramConversationHasMessages(
            supabase,
            conversation.id
        )

        if (!exactConversationHasMessages) {
            await deleteInstagramConversationById(supabase, conversation.id)
            return fallbackConversation
        }
    }

    if (conversation) return conversation
    if (fallbackConversation) return fallbackConversation

    const nowIso = new Date().toISOString()
    const { data: createdConversation, error: createConversationError } = await supabase
        .from('conversations')
        .insert({
            id: uuidv4(),
            organization_id: organizationId,
            platform: 'instagram',
            contact_name: contactIdentity.contactName || contactId,
            contact_avatar_url: contactIdentity.avatarUrl,
            contact_phone: contactId,
            status: 'open',
            unread_count: 0,
            tags: [],
            last_message_at: nowIso,
            updated_at: nowIso
        })
        .select()
        .single()

    if (createConversationError) {
        if (createConversationError.code === '23505') {
            return findInstagramConversationByContactId(supabase, organizationId, contactId)
        }

        console.error('Instagram Webhook: Failed to create conversation for outbound echo', createConversationError)
        return null
    }

    return createdConversation as InstagramWebhookConversation
}

async function persistInstagramExternalOutboundMessage(params: {
    supabase: any
    organizationId: string
    contactId: string
    contactIdentity: InstagramContactIdentity
    messageId: string
    text: string
    metadata: Record<string, unknown>
}) {
    const { data: existingMessage } = await params.supabase
        .from('messages')
        .select('id')
        .eq('organization_id', params.organizationId)
        .eq('metadata->>instagram_message_id', params.messageId)
        .maybeSingle()

    if ((existingMessage as { id?: string } | null)?.id) return

    const conversation = await ensureInstagramConversationForContact(
        params.supabase,
        params.organizationId,
        params.contactId,
        params.contactIdentity
    )

    if (!conversation) return

    const { error: insertError } = await params.supabase
        .from('messages')
        .insert({
            id: uuidv4(),
            conversation_id: conversation.id,
            organization_id: params.organizationId,
            sender_type: 'user',
            content: params.text,
            metadata: params.metadata
        })

    if (insertError) {
        if (insertError.code === '23505') return
        console.error('Instagram Webhook: Failed to save external outbound message', insertError)
        return
    }

    const nowIso = new Date().toISOString()
    const { error: updateConversationError } = await params.supabase
        .from('conversations')
        .update({
            contact_name: params.contactIdentity.contactName || conversation.contact_name || params.contactId,
            contact_avatar_url: params.contactIdentity.avatarUrl || conversation.contact_avatar_url || null,
            tags: clearInstagramRequestTag(conversation.tags),
            last_message_at: nowIso,
            unread_count: conversation.unread_count ?? 0,
            updated_at: nowIso
        })
        .eq('id', conversation.id)

    if (updateConversationError) {
        console.error('Instagram Webhook: Failed to update conversation after external outbound message', updateConversationError)
    }
}

async function resolveInstagramBusinessIdentity(params: {
    channel: InstagramChannelRecord
    client: InstagramClient
    instagramBusinessAccountId: string
}) {
    const fallbackUsername = readConfigString(params.channel.config, 'username')
    const fallbackAvatarUrl = readConfigString(params.channel.config, 'profile_picture_url')

    try {
        const profile = await params.client.getBusinessAccount(params.instagramBusinessAccountId)
        return {
            username: readTrimmedString(profile.username)
                || readTrimmedString(profile.name)
                || fallbackUsername,
            avatarUrl: readTrimmedString(profile.profile_picture_url) || fallbackAvatarUrl
        } satisfies InstagramBusinessIdentity
    } catch {
        return {
            username: fallbackUsername,
            avatarUrl: fallbackAvatarUrl
        } satisfies InstagramBusinessIdentity
    }
}

export async function GET(req: NextRequest) {
    const mode = req.nextUrl.searchParams.get('hub.mode')
    const token = req.nextUrl.searchParams.get('hub.verify_token')
    const challenge = req.nextUrl.searchParams.get('hub.challenge')
    const globalVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()
    const isGlobalVerifyToken = Boolean(globalVerifyToken && token === globalVerifyToken)

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

    if (!channel && !isGlobalVerifyToken) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (channel) {
        const nextConfig = {
            ...asConfigRecord(channel.config),
            webhook_status: 'verified',
            webhook_subscription_error: null,
            webhook_verified_at: new Date().toISOString()
        }

        await supabase
            .from('channels')
            .update({ config: nextConfig })
            .eq('id', channel.id)
    }

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
    const contactIdentityCache = new Map<string, InstagramContactIdentity>()
    const businessIdentityCache = new Map<string, InstagramBusinessIdentity>()

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

            channel = await markInstagramChannelWebhookVerified(supabase, resolvedChannel)
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

        const identityCacheKey = `${event.instagramBusinessAccountId}:${event.contactId}`
        let contactIdentity = contactIdentityCache.get(identityCacheKey) ?? null

        if (!contactIdentity) {
            const webhookContactName = readTrimmedString(event.contactName)
            try {
                const profile = await client.getUserProfile(event.contactId)
                const username = readTrimmedString(profile.username)
                const resolvedName = username || readTrimmedString(profile.name) || webhookContactName
                contactIdentity = {
                    contactName: resolvedName,
                    username,
                    avatarUrl: readTrimmedString(profile.profile_picture_url)
                }
            } catch (error) {
                if (debugEnabled) {
                    console.info('Instagram Webhook: Failed to resolve sender profile', {
                        instagram_business_account_id: event.instagramBusinessAccountId,
                        instagram_contact_id: event.contactId,
                        error: error instanceof Error ? error.message : String(error)
                    })
                }
                contactIdentity = {
                    contactName: webhookContactName,
                    username: null,
                    avatarUrl: null
                }
            }

            contactIdentityCache.set(identityCacheKey, contactIdentity)
        }

        if (!contactIdentity) continue

        let businessIdentity = businessIdentityCache.get(event.instagramBusinessAccountId) ?? null
        if (!businessIdentity && event.direction === 'outbound') {
            businessIdentity = await resolveInstagramBusinessIdentity({
                channel,
                client,
                instagramBusinessAccountId: event.instagramBusinessAccountId
            })
            businessIdentityCache.set(event.instagramBusinessAccountId, businessIdentity)
        }

        const messageMetadata = {
            outbound_channel: 'instagram',
            instagram_message_id: event.messageId,
            instagram_timestamp: event.timestamp,
            instagram_business_account_id: event.instagramBusinessAccountId,
            instagram_event_source: event.eventSource,
            instagram_event_type: event.eventType,
            instagram_message_direction: event.direction,
            instagram_contact_name: contactIdentity.contactName,
            instagram_contact_username: contactIdentity.username,
            instagram_contact_avatar_url: contactIdentity.avatarUrl,
            instagram_business_username: businessIdentity?.username ?? null,
            instagram_business_avatar_url: businessIdentity?.avatarUrl ?? null,
            ...(event.direction === 'outbound'
                ? {
                    instagram_is_echo: true
                }
                : {}),
            ...(event.media
                ? {
                    instagram_media_type: event.media.type,
                    instagram_is_media_placeholder: !readTrimmedString(event.media.caption),
                    instagram_media: {
                        type: event.media.type,
                        mime_type: event.media.mimeType,
                        caption: event.media.caption,
                        filename: null,
                        storage_path: null,
                        storage_url: event.media.url,
                        download_status: event.media.url ? 'remote' : 'missing'
                    }
                }
                : {})
        }

        if (event.direction === 'outbound') {
            await persistInstagramExternalOutboundMessage({
                supabase,
                organizationId: channel.organization_id,
                contactId: event.contactId,
                contactIdentity,
                messageId: event.messageId,
                text: event.text,
                metadata: messageMetadata
            })
            continue
        }

        await processInboundAiPipeline({
            supabase,
            organizationId: channel.organization_id,
            platform: 'instagram',
            source: 'instagram',
            contactId: event.contactId,
            contactName: contactIdentity.contactName,
            contactAvatarUrl: contactIdentity.avatarUrl,
            text: event.text,
            inboundMessageId: event.messageId,
            inboundMessageIdMetadataKey: 'instagram_message_id',
            inboundMessageMetadata: messageMetadata,
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
