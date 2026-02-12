import type { Channel, ConversationPlatform } from '@/types/database'

export type ChannelPlatformIconType = Channel['type'] | 'messenger'

const CHANNEL_PLATFORM_ICON_SOURCES: Record<ChannelPlatformIconType, string> = {
    telegram: '/Telegram.svg',
    whatsapp: '/whatsapp.svg',
    instagram: '/instagram.svg',
    messenger: '/messenger.svg'
}

export function getChannelPlatformIconSrc(platform: ChannelPlatformIconType) {
    return CHANNEL_PLATFORM_ICON_SOURCES[platform]
}

export function getConversationPlatformIconSrc(platform: ConversationPlatform): string | null {
    if (platform === 'simulator') return null
    return getChannelPlatformIconSrc(platform)
}
