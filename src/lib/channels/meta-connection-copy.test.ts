import { describe, expect, it } from 'vitest'

import { getMetaChannelConnectedCopy } from '@/lib/channels/meta-connection-copy'

describe('getMetaChannelConnectedCopy', () => {
    it('returns pending copy keys for pending instagram connections', () => {
        expect(getMetaChannelConnectedCopy('instagram', 'pending')).toEqual({
            descriptionKey: 'onboarding.instagram.pendingDescription',
            bannerKey: 'onboarding.instagram.pendingBanner',
            bannerVariant: 'warning'
        })
    })

    it('returns success copy keys for ready instagram connections', () => {
        expect(getMetaChannelConnectedCopy('instagram', 'ready')).toEqual({
            descriptionKey: 'onboarding.instagram.connectedDescription',
            bannerKey: 'onboarding.instagram.connectedBanner',
            bannerVariant: 'success'
        })
    })

    it('returns error copy keys for errored whatsapp connections', () => {
        expect(getMetaChannelConnectedCopy('whatsapp', 'error')).toEqual({
            descriptionKey: 'onboarding.whatsapp.errorDescription',
            bannerKey: 'onboarding.whatsapp.errorBanner',
            bannerVariant: 'error'
        })
    })
})
