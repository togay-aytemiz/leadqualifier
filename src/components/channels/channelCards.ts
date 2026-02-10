import type { Channel } from '@/types/database'

export type ChannelCardType = Channel['type'] | 'messenger'

export interface ChannelCardConfig {
    type: ChannelCardType
    channel?: Channel
    isComingSoon: boolean
}

export function getChannelCardConfigs(channels: Channel[]): ChannelCardConfig[] {
    const telegramChannel = channels.find(channel => channel.type === 'telegram')
    const whatsappChannel = channels.find(channel => channel.type === 'whatsapp')
    const instagramChannel = channels.find(channel => channel.type === 'instagram')

    return [
        {
            type: 'telegram',
            channel: telegramChannel,
            isComingSoon: false
        },
        {
            type: 'whatsapp',
            channel: whatsappChannel,
            isComingSoon: false
        },
        {
            type: 'instagram',
            channel: instagramChannel,
            isComingSoon: true
        },
        {
            type: 'messenger',
            isComingSoon: true
        }
    ]
}

export function getChannelsListLayoutClasses() {
    return 'flex flex-col gap-4'
}
