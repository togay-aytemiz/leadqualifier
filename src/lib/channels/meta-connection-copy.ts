import type { ChannelConnectionState } from '@/lib/channels/connection-readiness'

type MetaChannelType = 'whatsapp' | 'instagram'
type BannerVariant = 'success' | 'warning' | 'error'

interface MetaChannelConnectedCopy {
    descriptionKey: `onboarding.${MetaChannelType}.${string}`
    bannerKey: `onboarding.${MetaChannelType}.${string}`
    bannerVariant: BannerVariant
}

export function getMetaChannelConnectedCopy(
    channelType: MetaChannelType,
    connectionState: ChannelConnectionState
): MetaChannelConnectedCopy {
    const baseKey = `onboarding.${channelType}` as const

    if (connectionState === 'pending') {
        return {
            descriptionKey: `${baseKey}.pendingDescription`,
            bannerKey: `${baseKey}.pendingBanner`,
            bannerVariant: 'warning'
        }
    }

    if (connectionState === 'error') {
        return {
            descriptionKey: `${baseKey}.errorDescription`,
            bannerKey: `${baseKey}.errorBanner`,
            bannerVariant: 'error'
        }
    }

    return {
        descriptionKey: `${baseKey}.connectedDescription`,
        bannerKey: `${baseKey}.connectedBanner`,
        bannerVariant: 'success'
    }
}
