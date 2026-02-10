import { describe, expect, it } from 'vitest'

import { resolveMetaOrigin } from '@/lib/channels/meta-origin'

describe('resolveMetaOrigin', () => {
    it('uses NEXT_PUBLIC_APP_URL first when valid', () => {
        const origin = resolveMetaOrigin({
            appUrl: 'https://app.askqualy.com',
            siteUrl: 'https://www.askqualy.com',
            forwardedHost: 'main--leadqualifier.netlify.app',
            forwardedProto: 'https',
            requestOrigin: 'https://main--leadqualifier.netlify.app'
        })

        expect(origin).toBe('https://app.askqualy.com')
    })

    it('uses site url when app url is missing', () => {
        const origin = resolveMetaOrigin({
            appUrl: null,
            siteUrl: 'https://app.askqualy.com',
            forwardedHost: 'main--leadqualifier.netlify.app',
            forwardedProto: 'https',
            requestOrigin: 'https://main--leadqualifier.netlify.app'
        })

        expect(origin).toBe('https://app.askqualy.com')
    })

    it('uses forwarded host when configured urls are invalid', () => {
        const origin = resolveMetaOrigin({
            appUrl: 'not-a-url',
            siteUrl: '',
            forwardedHost: 'app.askqualy.com',
            forwardedProto: 'https',
            requestOrigin: 'https://main--leadqualifier.netlify.app'
        })

        expect(origin).toBe('https://app.askqualy.com')
    })

    it('handles comma-separated forwarded headers', () => {
        const origin = resolveMetaOrigin({
            appUrl: '',
            siteUrl: '',
            forwardedHost: 'app.askqualy.com, main--leadqualifier.netlify.app',
            forwardedProto: 'https,http',
            requestOrigin: 'https://main--leadqualifier.netlify.app'
        })

        expect(origin).toBe('https://app.askqualy.com')
    })

    it('falls back to request origin when no better candidate exists', () => {
        const origin = resolveMetaOrigin({
            appUrl: '',
            siteUrl: '',
            forwardedHost: '',
            forwardedProto: '',
            requestOrigin: 'https://main--leadqualifier.netlify.app'
        })

        expect(origin).toBe('https://main--leadqualifier.netlify.app')
    })
})

