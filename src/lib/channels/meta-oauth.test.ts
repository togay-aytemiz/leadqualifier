import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    buildMetaAuthorizeUrl,
    decodeMetaOAuthState,
    encodeMetaOAuthState,
    exchangeMetaCodeForToken,
    exchangeMetaForLongLivedToken,
    fetchMetaWhatsAppBusinessAccounts,
    fetchMetaWhatsAppBusinessAccountsFromDebugToken,
    hydrateMetaWhatsAppBusinessAccountsWithPhoneNumbers,
    getMetaOAuthScopes,
    resolveMetaInstagramConnectionCandidate,
    resolveMetaAppCredentials,
    resolveMetaOAuthStateSecret,
    resolveMetaChannelsReturnPath,
    pickInstagramConnectionCandidate,
    pickWhatsAppConnectionCandidate
} from '@/lib/channels/meta-oauth'

describe('meta oauth helpers', () => {
    afterEach(() => {
        delete process.env.META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT
        delete process.env.META_APP_ID
        delete process.env.META_APP_SECRET
        delete process.env.META_INSTAGRAM_APP_ID
        delete process.env.META_INSTAGRAM_APP_SECRET
        delete process.env.META_WHATSAPP_APP_ID
        delete process.env.META_WHATSAPP_APP_SECRET
        delete process.env.META_OAUTH_STATE_SECRET
        vi.restoreAllMocks()
    })

    it('prefers instagram-specific app credentials over shared meta credentials', () => {
        process.env.META_APP_ID = 'shared-app-id'
        process.env.META_APP_SECRET = 'shared-app-secret'
        process.env.META_INSTAGRAM_APP_ID = 'instagram-app-id'
        process.env.META_INSTAGRAM_APP_SECRET = 'instagram-app-secret'

        expect(resolveMetaAppCredentials('instagram')).toEqual({
            appId: 'instagram-app-id',
            appSecret: 'instagram-app-secret'
        })
    })

    it('prefers whatsapp-specific app credentials over shared meta credentials', () => {
        process.env.META_APP_ID = 'shared-app-id'
        process.env.META_APP_SECRET = 'shared-app-secret'
        process.env.META_WHATSAPP_APP_ID = 'whatsapp-app-id'
        process.env.META_WHATSAPP_APP_SECRET = 'whatsapp-app-secret'

        expect(resolveMetaAppCredentials('whatsapp')).toEqual({
            appId: 'whatsapp-app-id',
            appSecret: 'whatsapp-app-secret'
        })
    })

    it('falls back to global oauth state secret, then shared app secret', () => {
        process.env.META_OAUTH_STATE_SECRET = 'global-state-secret'
        process.env.META_APP_SECRET = 'shared-app-secret'

        expect(resolveMetaOAuthStateSecret()).toBe('global-state-secret')

        delete process.env.META_OAUTH_STATE_SECRET
        expect(resolveMetaOAuthStateSecret()).toBe('shared-app-secret')
    })

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

    it('builds instagram business-login oauth authorize url with expected params', () => {
        const url = buildMetaAuthorizeUrl({
            appId: 'app-1',
            redirectUri: 'https://example.com/api/channels/meta/callback',
            state: 'state-1',
            channel: 'instagram'
        })

        const parsedUrl = new URL(url)
        expect(parsedUrl.origin).toBe('https://www.instagram.com')
        expect(parsedUrl.pathname).toBe('/oauth/authorize')
        expect(parsedUrl.searchParams.get('force_reauth')).toBe('true')
        expect(parsedUrl.searchParams.get('client_id')).toBe('app-1')
        expect(parsedUrl.searchParams.get('redirect_uri')).toBe('https://example.com/api/channels/meta/callback')
        expect(parsedUrl.searchParams.get('response_type')).toBe('code')
        expect(parsedUrl.searchParams.get('state')).toBe('state-1')
        expect(parsedUrl.searchParams.get('scope')).toBe(getMetaOAuthScopes('instagram').join(','))
    })

    it('builds facebook oauth url for whatsapp', () => {
        const url = buildMetaAuthorizeUrl({
            appId: 'app-1',
            redirectUri: 'https://example.com/api/channels/meta/callback',
            state: 'state-1',
            channel: 'whatsapp'
        })

        expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth')
        expect(url).toContain('client_id=app-1')
        expect(url).toContain('state=state-1')
        expect(url).toContain('redirect_uri=')
        expect(url).toContain('auth_type=rerequest')
    })

    it('uses whatsapp-only scopes for whatsapp oauth', () => {
        const scopes = getMetaOAuthScopes('whatsapp')

        expect(scopes).toEqual([
            'whatsapp_business_management',
            'whatsapp_business_messaging'
        ])
        expect(scopes).not.toContain('business_management')
    })

    it('uses instagram-business scopes for instagram oauth', () => {
        const scopes = getMetaOAuthScopes('instagram')

        expect(scopes).toEqual([
            'instagram_business_basic',
            'instagram_business_manage_comments',
            'instagram_business_manage_messages'
        ])
    })

    it('optionally includes business_management scope for whatsapp oauth via env toggle', () => {
        process.env.META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT = '1'
        const scopes = getMetaOAuthScopes('whatsapp')

        expect(scopes).toEqual([
            'business_management',
            'whatsapp_business_management',
            'whatsapp_business_messaging'
        ])
    })

    it('uses instagram oauth endpoints for short-lived and long-lived token exchange', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ access_token: 'short-token-1' })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ access_token: 'long-token-1' })
            })
        vi.stubGlobal('fetch', fetchMock)

        const shortToken = await exchangeMetaCodeForToken({
            appId: 'ig-app-id',
            appSecret: 'ig-app-secret',
            redirectUri: 'https://example.com/api/channels/meta/callback',
            code: 'code-1',
            channel: 'instagram'
        })

        expect(shortToken).toBe('short-token-1')
        expect(fetchMock).toHaveBeenCalledTimes(1)

        const shortTokenEndpoint = (fetchMock.mock.calls[0]?.[0] as string) ?? ''
        const shortTokenInit = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined) ?? {}
        expect(shortTokenEndpoint).toBe('https://api.instagram.com/oauth/access_token')
        expect(shortTokenInit.method).toBe('POST')

        const shortTokenBody = typeof shortTokenInit.body === 'string' ? shortTokenInit.body : ''
        const shortTokenParams = new URLSearchParams(shortTokenBody)
        expect(shortTokenParams.get('grant_type')).toBe('authorization_code')
        expect(shortTokenParams.get('client_id')).toBe('ig-app-id')
        expect(shortTokenParams.get('client_secret')).toBe('ig-app-secret')
        expect(shortTokenParams.get('redirect_uri')).toBe('https://example.com/api/channels/meta/callback')
        expect(shortTokenParams.get('code')).toBe('code-1')

        const longToken = await exchangeMetaForLongLivedToken({
            appId: 'ig-app-id',
            appSecret: 'ig-app-secret',
            shortLivedToken: 'short-token-1',
            channel: 'instagram'
        })

        expect(longToken).toBe('long-token-1')
        expect(fetchMock).toHaveBeenCalledTimes(2)

        const longTokenEndpoint = new URL((fetchMock.mock.calls[1]?.[0] as string) ?? 'https://example.com')
        expect(`${longTokenEndpoint.origin}${longTokenEndpoint.pathname}`).toBe('https://graph.instagram.com/access_token')
        expect(longTokenEndpoint.searchParams.get('grant_type')).toBe('ig_exchange_token')
        expect(longTokenEndpoint.searchParams.get('client_secret')).toBe('ig-app-secret')
        expect(longTokenEndpoint.searchParams.get('access_token')).toBe('short-token-1')
    })

    it('keeps whatsapp token exchange on graph facebook oauth endpoints', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ access_token: 'wa-short-token-1' })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ access_token: 'wa-long-token-1' })
            })
        vi.stubGlobal('fetch', fetchMock)

        const shortToken = await exchangeMetaCodeForToken({
            appId: 'wa-app-id',
            appSecret: 'wa-app-secret',
            redirectUri: 'https://example.com/api/channels/meta/callback',
            code: 'wa-code-1',
            channel: 'whatsapp'
        })
        expect(shortToken).toBe('wa-short-token-1')

        const shortTokenEndpoint = new URL((fetchMock.mock.calls[0]?.[0] as string) ?? 'https://example.com')
        expect(`${shortTokenEndpoint.origin}${shortTokenEndpoint.pathname}`).toBe('https://graph.facebook.com/v21.0/oauth/access_token')
        expect(shortTokenEndpoint.searchParams.get('client_id')).toBe('wa-app-id')
        expect(shortTokenEndpoint.searchParams.get('client_secret')).toBe('wa-app-secret')
        expect(shortTokenEndpoint.searchParams.get('code')).toBe('wa-code-1')

        const longToken = await exchangeMetaForLongLivedToken({
            appId: 'wa-app-id',
            appSecret: 'wa-app-secret',
            shortLivedToken: 'wa-short-token-1',
            channel: 'whatsapp'
        })
        expect(longToken).toBe('wa-long-token-1')

        const longTokenEndpoint = new URL((fetchMock.mock.calls[1]?.[0] as string) ?? 'https://example.com')
        expect(`${longTokenEndpoint.origin}${longTokenEndpoint.pathname}`).toBe('https://graph.facebook.com/v21.0/oauth/access_token')
        expect(longTokenEndpoint.searchParams.get('grant_type')).toBe('fb_exchange_token')
        expect(longTokenEndpoint.searchParams.get('fb_exchange_token')).toBe('wa-short-token-1')
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
            instagramAppScopedId: null,
            instagramUsername: 'leadqualifier'
        })
    })

    it('resolves instagram candidate directly from instagram profile endpoint before page discovery', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    id: '26160270836990969',
                    user_id: '17841444965056435',
                    username: 'itsalinayalin'
                })
            })

        vi.stubGlobal('fetch', fetchMock)

        const candidate = await resolveMetaInstagramConnectionCandidate('token-1')
        expect(candidate).toEqual({
            pageId: '17841444965056435',
            pageName: 'itsalinayalin',
            pageAccessToken: 'token-1',
            instagramBusinessAccountId: '17841444965056435',
            instagramAppScopedId: '26160270836990969',
            instagramUsername: 'itsalinayalin'
        })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const profileEndpoint = new URL((fetchMock.mock.calls[0]?.[0] as string) ?? 'https://example.com')
        expect(`${profileEndpoint.origin}${profileEndpoint.pathname}`).toBe('https://graph.instagram.com/v25.0/me')
        expect(profileEndpoint.searchParams.get('fields')).toBe('user_id,username')
        expect(profileEndpoint.searchParams.get('access_token')).toBe('token-1')
    })

    it('falls back to facebook page discovery when instagram profile endpoints are unavailable', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: { message: '(#200) Missing Permissions' } })
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: { message: '(#100) Unsupported get request' } })
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: { message: '(#100) Unsupported get request' } })
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: { message: '(#100) Unsupported get request' } })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
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
            })

        vi.stubGlobal('fetch', fetchMock)

        const candidate = await resolveMetaInstagramConnectionCandidate('token-2')
        expect(candidate).toEqual({
            pageId: 'page-1',
            pageName: 'Leadqualifier Page',
            pageAccessToken: 'page-token-1',
            instagramBusinessAccountId: 'ig-1',
            instagramAppScopedId: null,
            instagramUsername: 'leadqualifier'
        })

        expect(fetchMock).toHaveBeenCalledTimes(5)
        const fallbackPagesEndpoint = new URL((fetchMock.mock.calls[4]?.[0] as string) ?? 'https://example.com')
        expect(`${fallbackPagesEndpoint.origin}${fallbackPagesEndpoint.pathname}`).toBe('https://graph.facebook.com/v21.0/me/accounts')
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

    it('picks whatsapp candidate even when business account name is missing', () => {
        const candidate = pickWhatsAppConnectionCandidate({
            data: [
                {
                    id: 'waba-1',
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
            businessAccountName: 'waba-1',
            phoneNumberId: 'phone-1',
            displayPhoneNumber: '+90 555 111 22 33'
        })
    })

    it('fetches whatsapp business accounts from direct /me endpoint when available', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                data: [
                    {
                        id: 'waba-1',
                        name: 'Leadqualifier WABA'
                    }
                ]
            })
        })

        vi.stubGlobal('fetch', fetchMock)

        const payload = await fetchMetaWhatsAppBusinessAccounts('token-1') as { data: Array<{ id: string }> }
        expect(payload.data[0]?.id).toBe('waba-1')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect((fetchMock.mock.calls[0]?.[0] as string) ?? '').toContain('/me/whatsapp_business_accounts')
    })

    it('falls back to business edges when /me/whatsapp_business_accounts is unavailable', async () => {
        process.env.META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT = '1'

        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({
                    error: {
                        message: '(#100) Tried accessing nonexisting field (whatsapp_business_accounts) on node type (User)'
                    }
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: [{ id: 'biz-1', name: 'Qualy Business' }]
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: [
                        {
                            id: 'waba-1',
                            name: 'Leadqualifier WABA'
                        }
                    ]
                })
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({
                    error: { message: '(#100) Unsupported get request.' }
                })
            })

        vi.stubGlobal('fetch', fetchMock)

        const payload = await fetchMetaWhatsAppBusinessAccounts('token-1') as { data: Array<{ id: string }> }
        expect(payload.data.map((item) => item.id)).toEqual(['waba-1'])
        expect(fetchMock).toHaveBeenCalledTimes(4)
        expect((fetchMock.mock.calls[1]?.[0] as string) ?? '').toContain('/me/businesses')
        expect((fetchMock.mock.calls[2]?.[0] as string) ?? '').toContain('/biz-1/owned_whatsapp_business_accounts')
    })

    it('falls back to business edges when direct whatsapp accounts endpoint returns missing permission', async () => {
        process.env.META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT = '1'

        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({
                    error: {
                        message: '(#100) Missing Permission'
                    }
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: [{ id: 'biz-1', name: 'Qualy Business' }]
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: [
                        {
                            id: 'waba-1',
                            phone_numbers: {
                                data: [
                                    { id: 'phone-1', display_phone_number: '+90 555 111 22 33' }
                                ]
                            }
                        }
                    ]
                })
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({
                    error: { message: '(#100) Unsupported get request.' }
                })
            })

        vi.stubGlobal('fetch', fetchMock)

        const payload = await fetchMetaWhatsAppBusinessAccounts('token-1') as { data: Array<{ id: string }> }
        expect(payload.data.map((item) => item.id)).toEqual(['waba-1'])
        expect(fetchMock).toHaveBeenCalledTimes(4)
        expect((fetchMock.mock.calls[1]?.[0] as string) ?? '').toContain('/me/businesses')
    })

    it('does not fall back to /me/businesses on missing permission when business_management scope toggle is off', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({
                error: {
                    message: '(#100) Missing Permission'
                }
            })
        })

        vi.stubGlobal('fetch', fetchMock)

        await expect(fetchMetaWhatsAppBusinessAccounts('token-1')).rejects.toThrow('Missing Permission [/v21.0/me/whatsapp_business_accounts]')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('hydrates phone numbers when whatsapp account payload is missing nested phone data', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                data: [
                    {
                        id: 'phone-1',
                        display_phone_number: '+90 555 111 22 33'
                    }
                ]
            })
        })
        vi.stubGlobal('fetch', fetchMock)

        const hydratedPayload = await hydrateMetaWhatsAppBusinessAccountsWithPhoneNumbers({
            userAccessToken: 'token-1',
            payload: {
                data: [
                    {
                        id: 'waba-1',
                        name: 'Leadqualifier WABA'
                    }
                ]
            }
        })

        const candidate = pickWhatsAppConnectionCandidate(hydratedPayload)
        expect(candidate?.phoneNumberId).toBe('phone-1')
        expect((fetchMock.mock.calls[0]?.[0] as string) ?? '').toContain('/waba-1/phone_numbers')
    })

    it('discovers whatsapp business accounts from debug token granular scopes', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: {
                        granular_scopes: [
                            {
                                scope: 'whatsapp_business_management',
                                target_ids: ['waba-1']
                            }
                        ]
                    }
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
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
                })
            })

        vi.stubGlobal('fetch', fetchMock)

        const payload = await fetchMetaWhatsAppBusinessAccountsFromDebugToken({
            userAccessToken: 'token-1',
            appId: 'app-1',
            appSecret: 'secret-1'
        })
        const candidate = pickWhatsAppConnectionCandidate(payload)

        expect(candidate?.businessAccountId).toBe('waba-1')
        expect(candidate?.phoneNumberId).toBe('phone-1')
        expect((fetchMock.mock.calls[0]?.[0] as string) ?? '').toContain('/debug_token')
        expect((fetchMock.mock.calls[1]?.[0] as string) ?? '').toContain('/waba-1?')
    })
})
