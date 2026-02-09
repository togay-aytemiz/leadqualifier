import { describe, expect, it } from 'vitest'

import {
    buildMetaAuthorizeUrl,
    decodeMetaOAuthState,
    encodeMetaOAuthState,
    getMetaOAuthScopes,
    resolveMetaChannelsReturnPath,
    pickInstagramConnectionCandidate,
    pickWhatsAppConnectionCandidate
} from '@/lib/channels/meta-oauth'

describe('meta oauth helpers', () => {
    it('encodes and decodes signed oauth state', () => {
        const secret = 'state-secret'
        const encoded = encodeMetaOAuthState({
            channel: 'whatsapp',
            organizationId: 'org-1',
            locale: 'tr',
            returnToPath: '/tr/settings/channels',
            nonce: 'nonce-1',
            issuedAt: 1738000000
        }, secret)

        const decoded = decodeMetaOAuthState(encoded, secret)
        expect(decoded).toEqual({
            channel: 'whatsapp',
            organizationId: 'org-1',
            locale: 'tr',
            returnToPath: '/tr/settings/channels',
            nonce: 'nonce-1',
            issuedAt: 1738000000
        })
    })

    it('returns null for tampered state', () => {
        const secret = 'state-secret'
        const encoded = encodeMetaOAuthState({
            channel: 'instagram',
            organizationId: 'org-1',
            locale: 'en',
            returnToPath: '/en/settings/channels',
            nonce: 'nonce-1',
            issuedAt: 1738000000
        }, secret)

        const tampered = `${encoded}x`
        expect(decodeMetaOAuthState(tampered, secret)).toBeNull()
    })

    it('resolves safe meta return path and falls back when invalid', () => {
        expect(resolveMetaChannelsReturnPath('tr', '/tr/settings/channels')).toBe('/tr/settings/channels')
        expect(resolveMetaChannelsReturnPath('en', '/en/settings/channels')).toBe('/en/settings/channels')
        expect(resolveMetaChannelsReturnPath('tr', '/settings/channels')).toBe('/settings/channels')
        expect(resolveMetaChannelsReturnPath('tr', null)).toBe('/settings/channels')
        expect(resolveMetaChannelsReturnPath('en', '//evil.example')).toBe('/en/settings/channels')
        expect(resolveMetaChannelsReturnPath('tr', '/api/channels/meta/start')).toBe('/settings/channels')
    })

    it('builds meta authorize url with expected params', () => {
        const url = buildMetaAuthorizeUrl({
            appId: 'app-1',
            redirectUri: 'https://example.com/api/channels/meta/callback',
            state: 'state-1',
            channel: 'instagram'
        })

        expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth')
        expect(url).toContain('client_id=app-1')
        expect(url).toContain('state=state-1')
        expect(url).toContain('redirect_uri=')

        const scopes = getMetaOAuthScopes('instagram')
        for (const scope of scopes) {
            expect(url).toContain(scope)
        }
    })

    it('picks instagram connection candidate from page accounts payload', () => {
        const candidate = pickInstagramConnectionCandidate({
            data: [
                {
                    id: 'page-1',
                    name: 'Leadqualifier Page',
                    access_token: 'page-token-1',
                    instagram_business_account: {
                        id: 'ig-1',
                        username: 'leadqualifier'
                    }
                }
            ]
        })

        expect(candidate).toEqual({
            pageId: 'page-1',
            pageName: 'Leadqualifier Page',
            pageAccessToken: 'page-token-1',
            instagramBusinessAccountId: 'ig-1',
            instagramUsername: 'leadqualifier'
        })
    })

    it('picks whatsapp connection candidate from business accounts payload', () => {
        const candidate = pickWhatsAppConnectionCandidate({
            data: [
                {
                    id: 'waba-1',
                    name: 'Leadqualifier WABA',
                    phone_numbers: {
                        data: [
                            {
                                id: 'phone-1',
                                display_phone_number: '+90 555 111 22 33'
                            }
                        ]
                    }
                }
            ]
        })

        expect(candidate).toEqual({
            businessAccountId: 'waba-1',
            businessAccountName: 'Leadqualifier WABA',
            phoneNumberId: 'phone-1',
            displayPhoneNumber: '+90 555 111 22 33'
        })
    })
})
