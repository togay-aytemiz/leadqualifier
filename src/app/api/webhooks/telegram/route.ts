import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'
import {
    isOutboundImageMessage,
    normalizeOutboundMessage
} from '@/lib/channels/outbound-message'
import { TelegramClient } from '@/lib/telegram/client'

function telegramDebug(...args: unknown[]) {
    if (process.env.NODE_ENV !== 'production') {
        console.debug(...args)
    }
}

function readTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readTelegramUpdate(req: NextRequest) {
    try {
        const payload = await req.json()
        return isRecord(payload) ? payload : null
    } catch {
        return null
    }
}

function resolveTelegramWebhookSecret(req: NextRequest) {
    const headerSecret = readTrimmedString(req.headers.get('x-telegram-bot-api-secret-token'))
    if (headerSecret) return headerSecret
    if (process.env.NODE_ENV === 'production') return null
    return readTrimmedString(req.nextUrl.searchParams.get('secret'))
}

function readTelegramTextMessage(update: Record<string, unknown>) {
    if (!isRecord(update.message)) return { status: 'ignored' as const }

    const message = update.message
    const text = readTrimmedString(message.text)
    if (!text) return { status: 'ignored' as const }

    if (!isRecord(message.chat) || !isRecord(message.from)) {
        return { status: 'invalid' as const }
    }

    const chatId = message.chat.id
    const fromId = message.from.id
    const messageId = message.message_id
    if (
        (typeof chatId !== 'string' && typeof chatId !== 'number')
        || (typeof fromId !== 'string' && typeof fromId !== 'number')
        || (typeof messageId !== 'string' && typeof messageId !== 'number')
    ) {
        return { status: 'invalid' as const }
    }

    return {
        status: 'valid' as const,
        text,
        from: message.from as { id: string | number, first_name?: string, last_name?: string },
        chatId: String(chatId),
        fromId,
        messageId: String(messageId)
    }
}

function readTelegramProviderMessageId(response: unknown) {
    if (!isRecord(response)) return null
    const messageId = response.message_id
    if (typeof messageId === 'string' || typeof messageId === 'number') {
        return String(messageId)
    }
    return null
}

async function resolveTelegramContactAvatarUrl(args: {
    botToken: string | null
    telegramUserId: number | string | null | undefined
    currentAvatarUrl: string | null | undefined
}) {
    const existingAvatarUrl = readTrimmedString(args.currentAvatarUrl)
    if (existingAvatarUrl) return existingAvatarUrl
    if (!args.botToken || args.telegramUserId === null || args.telegramUserId === undefined) {
        return null
    }

    try {
        const client = new TelegramClient(args.botToken)
        const profilePhotos = await client.getUserProfilePhotos(args.telegramUserId, { limit: 1 })
        const firstPhoto = Array.isArray(profilePhotos.photos) ? profilePhotos.photos[0] : null
        const largestPhoto = Array.isArray(firstPhoto) ? firstPhoto[firstPhoto.length - 1] : null
        const fileId = readTrimmedString(largestPhoto?.file_id)
        if (!fileId) return null

        const file = await client.getFile(fileId)
        const filePath = readTrimmedString(file.file_path)
        if (!filePath) return null

        return `https://api.telegram.org/file/bot${args.botToken}/${filePath}`
    } catch (error) {
        console.warn('Telegram Webhook: Failed to resolve contact avatar', {
            telegramUserId: args.telegramUserId,
            error
        })
        return null
    }
}

export async function POST(req: NextRequest) {
    const secretToken = resolveTelegramWebhookSecret(req)

    const update = await readTelegramUpdate(req)
    if (!update) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const telegramMessage = readTelegramTextMessage(update)

    telegramDebug('Telegram Webhook: Received update', {
        updateId: update.update_id,
        hasMessage: telegramMessage.status === 'valid',
        hasSecret: !!secretToken
    })

    if (telegramMessage.status === 'ignored') {
        telegramDebug('Telegram Webhook: Skipping non-text update')
        return NextResponse.json({ ok: true })
    }

    if (telegramMessage.status === 'invalid') {
        return NextResponse.json({ error: 'Invalid Telegram message payload' }, { status: 400 })
    }

    if (!secretToken) {
        console.warn('Telegram Webhook: Missing secret token')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )

    const { data: channel } = await supabase
        .from('channels')
        .select('id, organization_id, config')
        .eq('type', 'telegram')
        .eq('status', 'active')
        .eq('config->>webhook_secret', secretToken)
        .single()

    telegramDebug('Telegram Webhook: Channel lookup by secret', {
        found: !!channel,
        channelId: channel?.id
    })

    if (!channel) {
        console.warn('Telegram Webhook: No matching channel found for secret')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = channel.organization_id
    const botToken = readTrimmedString(channel.config?.bot_token)
    const chatId = telegramMessage.chatId
    const resolvedContactName = `${telegramMessage.from.first_name} ${telegramMessage.from.last_name || ''}`.trim()

    const { data: existingConversation } = await supabase
        .from('conversations')
        .select('contact_avatar_url')
        .eq('organization_id', orgId)
        .eq('platform', 'telegram')
        .eq('contact_phone', chatId)
        .limit(1)
        .maybeSingle()

    const contactAvatarUrl = await resolveTelegramContactAvatarUrl({
        botToken,
        telegramUserId: telegramMessage.fromId,
        currentAvatarUrl: existingConversation?.contact_avatar_url
    })

    const client = botToken ? new TelegramClient(botToken) : null

    await processInboundAiPipeline({
        supabase,
        organizationId: orgId,
        platform: 'telegram',
        source: 'telegram',
        contactId: chatId,
        contactName: resolvedContactName,
        contactAvatarUrl,
        text: telegramMessage.text,
        inboundMessageId: telegramMessage.messageId,
        inboundMessageIdMetadataKey: 'telegram_message_id',
        inboundMessageMetadata: {
            telegram_message_id: telegramMessage.messageId,
            telegram_contact_avatar_url: contactAvatarUrl
        },
        skipAutomation: !client,
        sendOutbound: async (content) => {
            if (!client) {
                throw new Error('Missing Telegram bot token for outbound reply')
            }

            if (isOutboundImageMessage(content)) {
                const response = await client.sendImage(
                    chatId,
                    content.imageUrl,
                    content.caption ?? undefined
                )
                return { providerMessageId: readTelegramProviderMessageId(response) }
            }

            const normalized = normalizeOutboundMessage(content)
            const response = await client.sendMessage(chatId, normalized.content)
            return { providerMessageId: readTelegramProviderMessageId(response) }
        },
        logPrefix: 'Telegram Webhook'
    })

    return NextResponse.json({ ok: true })
}
