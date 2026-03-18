import type { Channel, Json } from '@/types/database'

export type ChannelConnectionState = 'not_connected' | 'ready' | 'pending' | 'error'
export type WhatsAppWebhookStatus = 'pending' | 'verified' | 'error'

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

export function getWhatsAppWebhookStatus(config: Json): WhatsAppWebhookStatus {
    const verifiedAt = readConfigString(config, 'webhook_verified_at')
    if (verifiedAt) return 'verified'

    const storedStatus = readConfigString(config, 'webhook_status')
    if (storedStatus === 'verified' || storedStatus === 'error' || storedStatus === 'pending') {
        return storedStatus
    }

    const subscriptionError = readConfigString(config, 'webhook_subscription_error')
    if (subscriptionError) return 'error'

    return 'pending'
}

export function getChannelConnectionState(
    channel: Pick<Channel, 'type' | 'status' | 'config'> | null | undefined
): ChannelConnectionState {
    if (!channel) return 'not_connected'
    if (channel.status === 'error') return 'error'
    if (channel.status !== 'active') return 'not_connected'
    if (channel.type !== 'whatsapp') return 'ready'

    const webhookStatus = getWhatsAppWebhookStatus(channel.config)
    if (webhookStatus === 'verified') return 'ready'
    if (webhookStatus === 'error') return 'error'
    return 'pending'
}

export function shouldCountChannelAsConnected(
    channel: Pick<Channel, 'type' | 'status' | 'config'> | null | undefined
) {
    return getChannelConnectionState(channel) === 'ready'
}
