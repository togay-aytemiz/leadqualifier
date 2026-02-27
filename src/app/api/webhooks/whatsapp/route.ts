import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Json } from '@/types/database'
import { WhatsAppClient } from '@/lib/whatsapp/client'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'
import { resolveWhatsAppMediaPlaceholder } from '@/lib/whatsapp/media-placeholders'
import {
    extractWhatsAppInboundMessages,
    isValidMetaSignature,
    type WhatsAppMediaMessageEvent
} from '@/lib/whatsapp/webhook'

export const runtime = 'nodejs'
const WHATSAPP_MEDIA_BUCKET = process.env.WHATSAPP_MEDIA_BUCKET?.trim() || 'whatsapp-media'
const STORABLE_MEDIA_TYPES = new Set(['image', 'document'])

interface WhatsAppChannelRecord {
    id: string
    organization_id: string
    config: Json
}

interface MediaStorageCapableClient {
    storage: {
        from: (bucket: string) => {
            upload: (
                path: string,
                fileBody: ArrayBuffer | Uint8Array,
                options?: {
                    contentType?: string
                    upsert?: boolean
                }
            ) => Promise<{ error: { message?: string } | null }>
            getPublicUrl: (path: string) => {
                data: { publicUrl: string | null }
            }
        }
    }
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

function sanitizePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function extensionFromFilename(filename: string | null) {
    if (!filename) return null
    const trimmed = filename.trim()
    if (!trimmed) return null
    const lastDot = trimmed.lastIndexOf('.')
    if (lastDot < 0 || lastDot === trimmed.length - 1) return null
    const extension = trimmed.slice(lastDot + 1).toLowerCase()
    return extension.replace(/[^a-z0-9]/g, '') || null
}

function extensionFromMimeType(mimeType: string | null) {
    if (!mimeType) return null
    const normalized = mimeType.toLowerCase()
    if (normalized.includes('jpeg')) return 'jpg'
    if (normalized.includes('png')) return 'png'
    if (normalized.includes('webp')) return 'webp'
    if (normalized.includes('gif')) return 'gif'
    if (normalized.includes('pdf')) return 'pdf'
    if (normalized.includes('msword')) return 'doc'
    if (normalized.includes('officedocument.wordprocessingml.document')) return 'docx'
    return null
}

function buildStoragePath(args: {
    organizationId: string
    phoneNumberId: string
    messageId: string
    mediaType: string
    extension: string
}) {
    const orgSegment = sanitizePathSegment(args.organizationId)
    const phoneSegment = sanitizePathSegment(args.phoneNumberId)
    const fileSegment = sanitizePathSegment(`${args.messageId}-${args.mediaType}`)
    return `${orgSegment}/${phoneSegment}/${fileSegment}.${args.extension}`
}

function toErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message
    return typeof error === 'string' ? error : 'Unknown error'
}

async function storeInboundMedia(args: {
    supabase: MediaStorageCapableClient
    client: WhatsAppClient
    channel: WhatsAppChannelRecord
    event: WhatsAppMediaMessageEvent
}) {
    const { event } = args
    if (!STORABLE_MEDIA_TYPES.has(event.mediaType)) {
        return {
            storagePath: null as string | null,
            storageUrl: null as string | null,
            downloadStatus: 'skipped' as const,
            downloadError: null as string | null,
            mimeType: event.mimeType,
            sha256: event.sha256,
            filename: event.filename
        }
    }

    try {
        const mediaMetadata = await args.client.getMediaMetadata(event.mediaId)
        const mediaUrl = typeof mediaMetadata.url === 'string' ? mediaMetadata.url.trim() : ''
        if (!mediaUrl) {
            throw new Error('WhatsApp media URL is missing')
        }

        const downloadResult = await args.client.downloadMedia(mediaUrl)
        const mimeType = (
            downloadResult.contentType?.trim()
            || mediaMetadata.mime_type?.trim()
            || event.mimeType
            || 'application/octet-stream'
        )
        const sha256 = mediaMetadata.sha256?.trim() || event.sha256
        const filename = event.filename
        const extension = extensionFromFilename(filename) || extensionFromMimeType(mimeType) || 'bin'
        const storagePath = buildStoragePath({
            organizationId: args.channel.organization_id,
            phoneNumberId: event.phoneNumberId,
            messageId: event.messageId,
            mediaType: event.mediaType,
            extension
        })

        const storage = args.supabase.storage.from(WHATSAPP_MEDIA_BUCKET)
        const { error: uploadError } = await storage.upload(
            storagePath,
            new Uint8Array(downloadResult.data),
            {
                contentType: mimeType,
                upsert: true
            }
        )

        if (uploadError) {
            throw uploadError
        }

        const { data: publicUrlData } = storage.getPublicUrl(storagePath)

        return {
            storagePath,
            storageUrl: publicUrlData?.publicUrl ?? null,
            downloadStatus: 'stored' as const,
            downloadError: null as string | null,
            mimeType,
            sha256,
            filename
        }
    } catch (error) {
        const errorMessage = toErrorMessage(error)
        console.error('WhatsApp Webhook: Failed to download/store media', {
            organization_id: args.channel.organization_id,
            message_id: event.messageId,
            media_id: event.mediaId,
            media_type: event.mediaType,
            error: errorMessage
        })

        return {
            storagePath: null as string | null,
            storageUrl: null as string | null,
            downloadStatus: 'failed' as const,
            downloadError: errorMessage,
            mimeType: event.mimeType,
            sha256: event.sha256,
            filename: event.filename
        }
    }
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

    const events = extractWhatsAppInboundMessages(payload)
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

        const baseMetadata = {
            whatsapp_message_id: event.messageId,
            whatsapp_timestamp: event.timestamp,
            phone_number_id: event.phoneNumberId
        }

        if (event.kind === 'text') {
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
                    ...baseMetadata,
                    whatsapp_message_type: 'text'
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
            continue
        }

        const mediaStorageResult = await storeInboundMedia({
            supabase,
            client,
            channel,
            event
        })
        const caption = event.caption?.trim() || null
        const messageText = caption ?? resolveWhatsAppMediaPlaceholder(event.mediaType)
        const skipAutomation = caption === null

        await processInboundAiPipeline({
            supabase,
            organizationId: channel.organization_id,
            platform: 'whatsapp',
            source: 'whatsapp',
            contactId: event.contactPhone,
            contactName: event.contactName,
            text: messageText,
            inboundMessageId: event.messageId,
            inboundMessageIdMetadataKey: 'whatsapp_message_id',
            inboundMessageMetadata: {
                ...baseMetadata,
                whatsapp_message_type: event.mediaType,
                whatsapp_media_type: event.mediaType,
                whatsapp_media_id: event.mediaId,
                whatsapp_media_mime_type: mediaStorageResult.mimeType,
                whatsapp_media_sha256: mediaStorageResult.sha256,
                whatsapp_media_caption: caption,
                whatsapp_media_filename: mediaStorageResult.filename,
                whatsapp_is_media_placeholder: skipAutomation,
                whatsapp_media: {
                    type: event.mediaType,
                    media_id: event.mediaId,
                    mime_type: mediaStorageResult.mimeType,
                    sha256: mediaStorageResult.sha256,
                    caption,
                    filename: mediaStorageResult.filename,
                    storage_path: mediaStorageResult.storagePath,
                    storage_url: mediaStorageResult.storageUrl,
                    download_status: mediaStorageResult.downloadStatus,
                    download_error: mediaStorageResult.downloadError
                }
            },
            skipAutomation,
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
