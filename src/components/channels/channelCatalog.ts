import type { Channel } from '@/types/database'
import {
    WHATSAPP_MIGRATION_GUIDE_URL,
    WHATSAPP_OVERVIEW_URL
} from '@/components/channels/whatsappOnboarding'

export type ChannelCardType = Channel['type'] | 'messenger'
export type ChannelCardTone = 'emerald' | 'sky' | 'indigo' | 'sunset'
export type ChannelCardBadge = 'popular' | 'comingSoon'
export type ChannelOnboardingSurface = 'interactive' | 'placeholder'

export interface ChannelCatalogResource {
    labelKey: string
    href: string
}

export interface ChannelCatalogEntry {
    type: ChannelCardType
    href: string
    tone: ChannelCardTone
    badge?: ChannelCardBadge
    onboardingSurface: ChannelOnboardingSurface
    resources: ChannelCatalogResource[]
}

const CHANNEL_CATALOG: ChannelCatalogEntry[] = [
    {
        type: 'whatsapp',
        href: '/settings/channels/whatsapp',
        tone: 'emerald',
        onboardingSurface: 'interactive',
        resources: [
            {
                labelKey: 'whatsappOverview',
                href: WHATSAPP_OVERVIEW_URL
            },
            {
                labelKey: 'whatsappMigration',
                href: WHATSAPP_MIGRATION_GUIDE_URL
            },
            {
                labelKey: 'whatsappPricing',
                href: 'https://www.whatsapp.com/business/api/pricing/'
            }
        ]
    },
    {
        type: 'instagram',
        href: '/settings/channels/instagram',
        tone: 'sunset',
        onboardingSurface: 'interactive',
        resources: [
            {
                labelKey: 'instagramOverview',
                href: 'https://www.facebook.com/help/502981923235522'
            }
        ]
    },
    {
        type: 'messenger',
        href: '/settings/channels/messenger',
        tone: 'indigo',
        badge: 'comingSoon',
        onboardingSurface: 'placeholder',
        resources: [
            {
                labelKey: 'messengerOverview',
                href: 'https://www.facebook.com/business/goals/add-messenger-chat-to-website'
            }
        ]
    },
    {
        type: 'telegram',
        href: '/settings/channels/telegram',
        tone: 'sky',
        onboardingSurface: 'interactive',
        resources: [
            {
                labelKey: 'telegramOverview',
                href: 'https://core.telegram.org/bots/tutorial'
            }
        ]
    }
]

export function getChannelCatalog() {
    return CHANNEL_CATALOG
}

export function getChannelCatalogEntry(type: ChannelCardType) {
    return CHANNEL_CATALOG.find((entry) => entry.type === type)
}

export function getChannelSetupHref(type: ChannelCardType) {
    return getChannelCatalogEntry(type)?.href ?? `/settings/channels/${type}`
}
