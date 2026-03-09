import { getChannelCatalog, type ChannelCardBadge, type ChannelCardTone, type ChannelCardType } from '@/components/channels/channelCatalog'
import type { Channel } from '@/types/database'

export interface ChannelCardConfig {
    type: ChannelCardType
    channel?: Channel
    isComingSoon: boolean
    tone: ChannelCardTone
    badge?: ChannelCardBadge
    href: string
}

export function getChannelCardConfigs(channels: Channel[]): ChannelCardConfig[] {
    return getChannelCatalog().map((entry) => {
        const channel = entry.type === 'messenger'
            ? undefined
            : channels.find((item) => item.type === entry.type)
        const isComingSoon = entry.type === 'instagram'
            ? !channel
            : entry.onboardingSurface === 'placeholder'

        return {
            type: entry.type,
            channel,
            isComingSoon,
            tone: entry.tone,
            badge: channel && entry.type === 'instagram' ? undefined : entry.badge,
            href: entry.href
        }
    })
}

export function getChannelsListLayoutClasses() {
    return 'grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3'
}
