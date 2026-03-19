import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    createClientMock,
    extractInstagramInboundEventsMock,
    getUserProfileMock,
    instagramCtorMock,
    isValidMetaSignatureMock,
    processInboundAiPipelineMock,
    resolveMetaInstagramConnectionCandidateMock,
    sendTextMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    extractInstagramInboundEventsMock: vi.fn(),
    getUserProfileMock: vi.fn(),
    instagramCtorMock: vi.fn(),
    isValidMetaSignatureMock: vi.fn(),
    processInboundAiPipelineMock: vi.fn(),
    resolveMetaInstagramConnectionCandidateMock: vi.fn(),
    sendTextMock: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/instagram/webhook', () => ({
    extractInstagramInboundEvents: extractInstagramInboundEventsMock,
    isValidMetaSignature: isValidMetaSignatureMock
}))

vi.mock('@/lib/channels/inbound-ai-pipeline', () => ({
    processInboundAiPipeline: processInboundAiPipelineMock
}))

vi.mock('@/lib/channels/meta-oauth', () => ({
    resolveMetaInstagramConnectionCandidate: resolveMetaInstagramConnectionCandidateMock
}))

vi.mock('@/lib/instagram/client', () => ({
    InstagramClient: class {
        constructor(token: string) {
            instagramCtorMock(token)
        }

        getUserProfile = getUserProfileMock
        sendText = sendTextMock
    }
}))

import { GET, POST } from '@/app/api/webhooks/instagram/route'

function createChannelsQuery(options: {
    directLookupData?: unknown
    directLookupMatcher?: (query: string) => unknown
    listData?: unknown[]
}) {
    const eqMock = vi.fn()
    const maybeSingleMock = vi.fn(async () => ({ data: options.directLookupData ?? null }))
    const orMaybeSingleMock = vi.fn(async (query: string) => ({
        data: options.directLookupMatcher ? options.directLookupMatcher(query) : options.directLookupData ?? null
    }))
    const queryBuilder = {
        eq: eqMock,
        maybeSingle: maybeSingleMock,
        or: vi.fn((query: string) => ({
            maybeSingle: () => orMaybeSingleMock(query)
        })),
        then: (resolve: (value: { data: unknown[] }) => unknown) =>
            Promise.resolve({ data: options.listData ?? [] }).then(resolve)
    }
    eqMock.mockReturnValue(queryBuilder)

    return {
        queryBuilder,
        maybeSingleMock,
        orMaybeSingleMock
    }
}

function createInstagramSupabaseMock(options: {
    directLookupData?: unknown
    directLookupMatcher?: (query: string) => unknown
    listData?: unknown[]
}) {
    const channelsQuery = createChannelsQuery(options)
    const updateEqMock = vi.fn(async () => ({ error: null }))
    const updateMock = vi.fn(() => ({ eq: updateEqMock }))
    const selectMock = vi.fn(() => channelsQuery.queryBuilder)
    const fromMock = vi.fn((table: string) => {
        if (table !== 'channels') {
            throw new Error(`Unexpected table ${table}`)
        }

        return {
            select: selectMock,
            update: updateMock
        }
    })

    return {
        supabase: {
            from: fromMock
        },
        fromMock,
        selectMock,
        updateMock,
        updateEqMock,
        maybeSingleMock: channelsQuery.maybeSingleMock,
        orMaybeSingleMock: channelsQuery.orMaybeSingleMock
    }
}

describe('Instagram webhook route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    })

    afterEach(() => {
        delete process.env.META_WEBHOOK_VERIFY_TOKEN
    })

    it('marks matching instagram channels verified when global verify token matches on GET', async () => {
        process.env.META_WEBHOOK_VERIFY_TOKEN = 'global-token'
        const { supabase, updateMock, updateEqMock } = createInstagramSupabaseMock({
            directLookupData: {
                id: 'channel-ig-1',
                config: {
                    verify_token: 'global-token',
                    webhook_status: 'pending',
                    webhook_verified_at: null
                }
            }
        })
        createClientMock.mockReturnValue(supabase)

        const req = new NextRequest(
            'http://localhost/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=global-token&hub.challenge=challenge-ok'
        )

        const res = await GET(req)

        expect(res.status).toBe(200)
        await expect(res.text()).resolves.toBe('challenge-ok')
        expect(createClientMock).toHaveBeenCalled()
        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
            config: expect.objectContaining({
                webhook_status: 'verified',
                webhook_verified_at: expect.any(String)
            })
        }))
        expect(updateEqMock).toHaveBeenCalledWith('id', 'channel-ig-1')
    })

    it('routes page-id based instagram webhook events into the shared inbound pipeline', async () => {
        const event = {
            instagramBusinessAccountId: 'page-1',
            contactId: 'ig-user-1',
            contactName: 'Ayse',
            messageId: 'ig-mid-1',
            text: 'Merhaba',
            timestamp: '1738000000',
            eventSource: 'messaging',
            eventType: 'message',
            skipAutomation: false
        }

        const { supabase, orMaybeSingleMock, updateMock } = createInstagramSupabaseMock({
            directLookupMatcher: (query) => query.includes('config->>page_id.eq.page-1')
                ? {
                    id: 'channel-ig-1',
                    organization_id: 'org-1',
                    config: {
                        page_id: 'page-1',
                        instagram_business_account_id: 'ig-biz-1',
                        instagram_app_scoped_id: 'ig-app-1',
                        app_secret: 'app-secret',
                        page_access_token: 'token-ig-1'
                    }
                }
                : null,
            listData: []
        })

        createClientMock.mockReturnValue(supabase)
        extractInstagramInboundEventsMock.mockReturnValue([event])
        isValidMetaSignatureMock.mockReturnValue(true)
        resolveMetaInstagramConnectionCandidateMock.mockResolvedValue(null)
        getUserProfileMock.mockResolvedValue({
            id: 'ig-user-1',
            username: 'ayse',
            name: 'Ayse',
            profile_picture_url: null
        })

        const req = new NextRequest('http://localhost/api/webhooks/instagram', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': 'sha256=valid'
            },
            body: JSON.stringify({ entry: [] })
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(orMaybeSingleMock).toHaveBeenCalled()
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-1',
            platform: 'instagram',
            source: 'instagram',
            contactId: 'ig-user-1',
            inboundMessageId: 'ig-mid-1'
        }))
        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
            config: expect.objectContaining({
                webhook_status: 'verified',
                webhook_verified_at: expect.any(String)
            })
        }))
    })
})
