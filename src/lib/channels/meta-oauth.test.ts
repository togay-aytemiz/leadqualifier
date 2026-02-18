import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    buildMetaAuthorizeUrl,
    decodeMetaOAuthState,
    encodeMetaOAuthState,
    fetchMetaWhatsAppBusinessAccounts,
    fetchMetaWhatsAppBusinessAccountsFromDebugToken,
    hydrateMetaWhatsAppBusinessAccountsWithPhoneNumbers,
    getMetaOAuthScopes,
    resolveMetaChannelsReturnPath,
    pickInstagramConnectionCandidate,
    pickWhatsAppConnectionCandidate
} from '@/lib/channels/meta-oauth'

describe('meta oauth helpers', () => {
    afterEach(() => {
        delete process.env.META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT
        vi.restoreAllMocks()
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
        expect(url).toContain('auth_type=rerequest')

        const scopes = getMetaOAuthScopes('instagram')
        for (const scope of scopes) {
            expect(url).toContain(scope)
        }
    })

    it('uses whatsapp-only scopes for whatsapp oauth', () => {
        const scopes = getMetaOAuthScopes('whatsapp')

        expect(scopes).toEqual([
            'whatsapp_business_management',
            'whatsapp_business_messaging'
        ])
        expect(scopes).not.toContain('business_management')
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
