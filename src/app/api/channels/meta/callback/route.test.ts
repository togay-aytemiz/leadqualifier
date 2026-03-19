import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    assertTenantWriteAllowedMock,
    createClientMock,
    decodeMetaOAuthStateMock,
    exchangeMetaCodeForTokenMock,
    exchangeMetaForLongLivedTokenMock,
    instagramCtorMock,
    resolveActiveOrganizationContextMock,
    resolveMetaAppCredentialsMock,
    resolveMetaChannelsReturnPathMock,
    resolveMetaInstagramConnectionCandidateMock,
    resolveMetaOAuthStateSecretMock,
    resolveMetaOriginMock,
    subscribeAppToAccountMock
} = vi.hoisted(() => ({
    assertTenantWriteAllowedMock: vi.fn(),
    createClientMock: vi.fn(),
    decodeMetaOAuthStateMock: vi.fn(),
    exchangeMetaCodeForTokenMock: vi.fn(),
    exchangeMetaForLongLivedTokenMock: vi.fn(),
    instagramCtorMock: vi.fn(),
    resolveActiveOrganizationContextMock: vi.fn(),
    resolveMetaAppCredentialsMock: vi.fn(),
    resolveMetaChannelsReturnPathMock: vi.fn(),
    resolveMetaInstagramConnectionCandidateMock: vi.fn(),
    resolveMetaOAuthStateSecretMock: vi.fn(),
    resolveMetaOriginMock: vi.fn(),
    subscribeAppToAccountMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/organizations/active-context', () => ({
    assertTenantWriteAllowed: assertTenantWriteAllowedMock,
    resolveActiveOrganizationContext: resolveActiveOrganizationContextMock
}))

vi.mock('@/lib/channels/meta-oauth', () => ({
    decodeMetaOAuthState: decodeMetaOAuthStateMock,
    exchangeMetaCodeForToken: exchangeMetaCodeForTokenMock,
    exchangeMetaForLongLivedToken: exchangeMetaForLongLivedTokenMock,
    fetchMetaWhatsAppBusinessAccounts: vi.fn(),
    fetchMetaWhatsAppBusinessAccountsFromDebugToken: vi.fn(),
    hydrateMetaWhatsAppBusinessAccountsWithPhoneNumbers: vi.fn(),
    pickWhatsAppConnectionCandidate: vi.fn(),
    resolveMetaAppCredentials: resolveMetaAppCredentialsMock,
    resolveMetaChannelsReturnPath: resolveMetaChannelsReturnPathMock,
    resolveMetaInstagramConnectionCandidate: resolveMetaInstagramConnectionCandidateMock,
    resolveMetaOAuthStateSecret: resolveMetaOAuthStateSecretMock
}))

vi.mock('@/lib/channels/meta-origin', () => ({
    resolveMetaOrigin: resolveMetaOriginMock
}))

vi.mock('@/lib/instagram/client', () => ({
    INSTAGRAM_WEBHOOK_SUBSCRIBED_FIELDS: [
        'messages',
        'messaging_optins',
        'messaging_postbacks',
        'messaging_referral',
        'messaging_seen',
        'message_reactions',
        'messaging_handover',
        'standby'
    ],
    InstagramClient: class {
        constructor(token: string) {
            instagramCtorMock(token)
        }

        subscribeAppToAccount = subscribeAppToAccountMock
    }
}))

import { GET } from '@/app/api/channels/meta/callback/route'

describe('Meta OAuth callback route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resolveMetaOAuthStateSecretMock.mockReturnValue('state-secret')
        decodeMetaOAuthStateMock.mockReturnValue({
            channel: 'instagram',
            organizationId: 'org-1',
            locale: 'tr',
            returnToPath: '/settings/channels',
            nonce: 'nonce-1',
            issuedAt: 1738000000
        })
        resolveMetaAppCredentialsMock.mockReturnValue({
            appId: 'instagram-app-id',
            appSecret: 'instagram-app-secret'
        })
        resolveMetaChannelsReturnPathMock.mockImplementation((_locale: string, returnToPath: string | null | undefined) =>
            returnToPath || '/settings/channels'
        )
        resolveMetaOriginMock.mockReturnValue('https://app.askqualy.com')
        assertTenantWriteAllowedMock.mockResolvedValue(undefined)
        resolveActiveOrganizationContextMock.mockResolvedValue({
            activeOrganizationId: 'org-1'
        })
        exchangeMetaCodeForTokenMock.mockResolvedValue('short-token-1')
        exchangeMetaForLongLivedTokenMock.mockResolvedValue('long-token-1')
        resolveMetaInstagramConnectionCandidateMock.mockResolvedValue({
            pageId: '17841403722940346',
            pageName: 'sweetdreams.photography_tr',
            pageAccessToken: 'long-token-1',
            instagramBusinessAccountId: '17841403722940346',
            instagramAppScopedId: '25687475930930480',
            instagramUsername: 'sweetdreams.photography_tr'
        })
    })

    afterEach(() => {
        delete process.env.META_WEBHOOK_VERIFY_TOKEN
    })

    it('subscribes instagram accounts to webhook fields before persisting the channel', async () => {
        const upsertMock = vi.fn(async () => ({ error: null }))
        createClientMock.mockResolvedValue({
            from: vi.fn((table: string) => {
                if (table !== 'channels') {
                    throw new Error(`Unexpected table ${table}`)
                }

                return {
                    upsert: upsertMock
                }
            })
        })
        subscribeAppToAccountMock.mockResolvedValue({ success: true })

        const req = new NextRequest(
            'https://app.askqualy.com/api/channels/meta/callback?state=signed-state&code=oauth-code'
        )

        const res = await GET(req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('/settings/channels?meta_oauth=success&channel=instagram')
        expect(instagramCtorMock).toHaveBeenCalledWith('long-token-1')
        expect(subscribeAppToAccountMock).toHaveBeenCalledWith({
            instagramAccountId: '17841403722940346',
            subscribedFields: [
                'messages',
                'messaging_optins',
                'messaging_postbacks',
                'messaging_referral',
                'messaging_seen',
                'message_reactions',
                'messaging_handover',
                'standby'
            ]
        })
        expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
            organization_id: 'org-1',
            type: 'instagram',
            config: expect.objectContaining({
                webhook_status: 'pending',
                webhook_subscription_error: null,
                webhook_subscription_requested_at: expect.any(String),
                webhook_subscribed_fields: [
                    'messages',
                    'messaging_optins',
                    'messaging_postbacks',
                    'messaging_referral',
                    'messaging_seen',
                    'message_reactions',
                    'messaging_handover',
                    'standby'
                ]
            })
        }), {
            onConflict: 'organization_id,type'
        })
    })
})
