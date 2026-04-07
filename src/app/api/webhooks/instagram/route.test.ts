import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    createClientMock,
    extractInstagramInboundEventsMock,
    getBusinessAccountMock,
    getUserProfileMock,
    instagramCtorMock,
    isValidMetaSignatureMock,
    processInboundAiPipelineMock,
    resolveMetaInstagramConnectionCandidateMock,
    sendImageMock,
    sendTextMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    extractInstagramInboundEventsMock: vi.fn(),
    getBusinessAccountMock: vi.fn(),
    getUserProfileMock: vi.fn(),
    instagramCtorMock: vi.fn(),
    isValidMetaSignatureMock: vi.fn(),
    processInboundAiPipelineMock: vi.fn(),
    resolveMetaInstagramConnectionCandidateMock: vi.fn(),
    sendImageMock: vi.fn(),
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

        getBusinessAccount = getBusinessAccountMock
        getUserProfile = getUserProfileMock
        sendImage = sendImageMock
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

function createInstagramOutboundPersistenceSupabaseMock() {
    const existingConversation = {
        id: 'conv-1',
        organization_id: 'org-1',
        platform: 'instagram',
        contact_phone: 'ig-user-1',
        contact_name: 'old-name',
        contact_avatar_url: null,
        unread_count: 2,
        tags: ['instagram_request']
    }

    const channelsQuery = createChannelsQuery({
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

    const channelsUpdateEqMock = vi.fn(async () => ({ error: null }))
    const channelsUpdateMock = vi.fn(() => ({ eq: channelsUpdateEqMock }))
    const channelsSelectMock = vi.fn(() => channelsQuery.queryBuilder)

    const dedupeMaybeSingleMock = vi.fn(async () => ({ data: null }))
    const dedupeEqMock = vi.fn()
    const dedupeBuilder = {
        eq: dedupeEqMock,
        maybeSingle: dedupeMaybeSingleMock
    }
    dedupeEqMock.mockReturnValue(dedupeBuilder)
    const messagesSelectMock = vi.fn(() => dedupeBuilder)
    const messagesInsertMock = vi.fn(async () => ({ error: null }))

    const conversationMaybeSingleMock = vi.fn(async () => ({ data: existingConversation }))
    const conversationLimitMock = vi.fn(() => conversationLookupBuilder)
    const conversationEqMock = vi.fn()
    const conversationLookupBuilder = {
        eq: conversationEqMock,
        limit: conversationLimitMock,
        maybeSingle: conversationMaybeSingleMock
    }
    conversationEqMock.mockReturnValue(conversationLookupBuilder)
    const conversationsSelectMock = vi.fn(() => conversationLookupBuilder)
    const conversationsUpdateEqMock = vi.fn(async () => ({ error: null }))
    const conversationsUpdateMock = vi.fn(() => ({ eq: conversationsUpdateEqMock }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'channels') {
            return {
                select: channelsSelectMock,
                update: channelsUpdateMock
            }
        }

        if (table === 'messages') {
            return {
                select: messagesSelectMock,
                insert: messagesInsertMock
            }
        }

        if (table === 'conversations') {
            return {
                select: conversationsSelectMock,
                update: conversationsUpdateMock
            }
        }

        throw new Error(`Unexpected table ${table}`)
    })

    return {
        supabase: {
            from: fromMock
        },
        messagesInsertMock,
        conversationsUpdateMock,
        channelsUpdateMock
    }
}

function createInstagramOutboundFallbackConversationSupabaseMock() {
    const existingConversation = {
        id: 'conv-existing',
        organization_id: 'org-1',
        platform: 'instagram',
        contact_phone: '17841400000000000',
        contact_name: 'serayaytemiz',
        contact_avatar_url: 'https://cdn.example.com/existing.jpg',
        unread_count: 0,
        tags: []
    }

    const channelsQuery = createChannelsQuery({
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

    const channelsUpdateEqMock = vi.fn(async () => ({ error: null }))
    const channelsUpdateMock = vi.fn(() => ({ eq: channelsUpdateEqMock }))
    const channelsSelectMock = vi.fn(() => channelsQuery.queryBuilder)

    const dedupeMaybeSingleMock = vi.fn(async () => ({ data: null }))
    const dedupeEqMock = vi.fn()
    const dedupeBuilder = {
        eq: dedupeEqMock,
        maybeSingle: dedupeMaybeSingleMock
    }
    dedupeEqMock.mockReturnValue(dedupeBuilder)
    const messagesSelectMock = vi.fn(() => dedupeBuilder)
    const messagesInsertMock = vi.fn(async () => ({ error: null }))

    const phoneLookupEqMock = vi.fn()
    const phoneLookupBuilder = {
        eq: phoneLookupEqMock,
        limit: vi.fn(() => phoneLookupBuilder),
        maybeSingle: vi.fn(async () => ({ data: null }))
    }
    phoneLookupEqMock.mockReturnValue(phoneLookupBuilder)

    const nameLookupEqMock = vi.fn()
    const nameLookupBuilder = {
        eq: nameLookupEqMock,
        limit: vi.fn(() => nameLookupBuilder),
        maybeSingle: vi.fn(async () => ({ data: existingConversation }))
    }
    nameLookupEqMock.mockReturnValue(nameLookupBuilder)

    const conversationSelectBuilders = [phoneLookupBuilder, nameLookupBuilder]
    const conversationsSelectMock = vi.fn(() => {
        const nextBuilder = conversationSelectBuilders.shift()
        if (!nextBuilder) {
            throw new Error('Unexpected extra conversations select call')
        }
        return nextBuilder
    })
    const conversationsUpdateEqMock = vi.fn(async () => ({ error: null }))
    const conversationsUpdateMock = vi.fn(() => ({ eq: conversationsUpdateEqMock }))
    const conversationsInsertMock = vi.fn(() => {
        throw new Error('Conversation insert should not be called when username fallback matches')
    })

    const fromMock = vi.fn((table: string) => {
        if (table === 'channels') {
            return {
                select: channelsSelectMock,
                update: channelsUpdateMock
            }
        }

        if (table === 'messages') {
            return {
                select: messagesSelectMock,
                insert: messagesInsertMock
            }
        }

        if (table === 'conversations') {
            return {
                select: conversationsSelectMock,
                update: conversationsUpdateMock,
                insert: conversationsInsertMock
            }
        }

        throw new Error(`Unexpected table ${table}`)
    })

    return {
        supabase: {
            from: fromMock
        },
        messagesInsertMock,
        conversationsUpdateMock
    }
}

function createInstagramOutboundEmptyDuplicateSupabaseMock() {
    const emptyDuplicateConversation = {
        id: 'conv-empty-duplicate',
        organization_id: 'org-1',
        platform: 'instagram',
        contact_phone: 'ig-recipient-new-scope',
        contact_name: 'serayaytemiz',
        contact_avatar_url: null,
        unread_count: 0,
        tags: []
    }

    const existingConversation = {
        id: 'conv-existing-history',
        organization_id: 'org-1',
        platform: 'instagram',
        contact_phone: '17841400000000000',
        contact_name: 'serayaytemiz',
        contact_avatar_url: 'https://cdn.example.com/existing.jpg',
        unread_count: 1,
        tags: []
    }

    const channelsQuery = createChannelsQuery({
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

    const channelsUpdateEqMock = vi.fn(async () => ({ error: null }))
    const channelsUpdateMock = vi.fn(() => ({ eq: channelsUpdateEqMock }))
    const channelsSelectMock = vi.fn(() => channelsQuery.queryBuilder)

    const dedupeEqMock = vi.fn()
    const dedupeBuilder = {
        eq: dedupeEqMock,
        maybeSingle: vi.fn(async () => ({ data: null }))
    }
    dedupeEqMock.mockReturnValue(dedupeBuilder)

    const emptyConversationMessageCheckEqMock = vi.fn()
    const emptyConversationMessageCheckBuilder = {
        eq: emptyConversationMessageCheckEqMock,
        limit: vi.fn(() => emptyConversationMessageCheckBuilder),
        maybeSingle: vi.fn(async () => ({ data: null }))
    }
    emptyConversationMessageCheckEqMock.mockReturnValue(emptyConversationMessageCheckBuilder)

    const messageSelectBuilders = [dedupeBuilder, emptyConversationMessageCheckBuilder]
    const messagesSelectMock = vi.fn(() => {
        const nextBuilder = messageSelectBuilders.shift()
        if (!nextBuilder) {
            throw new Error('Unexpected extra messages select call')
        }
        return nextBuilder
    })
    const messagesInsertMock = vi.fn(async () => ({ error: null }))

    const exactLookupEqMock = vi.fn()
    const exactLookupBuilder = {
        eq: exactLookupEqMock,
        limit: vi.fn(() => exactLookupBuilder),
        maybeSingle: vi.fn(async () => ({ data: emptyDuplicateConversation }))
    }
    exactLookupEqMock.mockReturnValue(exactLookupBuilder)

    const fallbackLookupEqMock = vi.fn()
    const fallbackLookupBuilder = {
        eq: fallbackLookupEqMock,
        limit: vi.fn(() => fallbackLookupBuilder),
        maybeSingle: vi.fn(async () => ({ data: existingConversation }))
    }
    fallbackLookupEqMock.mockReturnValue(fallbackLookupBuilder)

    const conversationSelectBuilders = [exactLookupBuilder, fallbackLookupBuilder]
    const conversationsSelectMock = vi.fn(() => {
        const nextBuilder = conversationSelectBuilders.shift()
        if (!nextBuilder) {
            throw new Error('Unexpected extra conversations select call')
        }
        return nextBuilder
    })
    const conversationsUpdateEqMock = vi.fn(async () => ({ error: null }))
    const conversationsUpdateMock = vi.fn(() => ({ eq: conversationsUpdateEqMock }))
    const conversationsDeleteEqMock = vi.fn(async () => ({ error: null }))
    const conversationsDeleteMock = vi.fn(() => ({ eq: conversationsDeleteEqMock }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'channels') {
            return {
                select: channelsSelectMock,
                update: channelsUpdateMock
            }
        }

        if (table === 'messages') {
            return {
                select: messagesSelectMock,
                insert: messagesInsertMock
            }
        }

        if (table === 'conversations') {
            return {
                select: conversationsSelectMock,
                update: conversationsUpdateMock,
                delete: conversationsDeleteMock
            }
        }

        throw new Error(`Unexpected table ${table}`)
    })

    return {
        supabase: {
            from: fromMock
        },
        messagesInsertMock,
        conversationsUpdateMock,
        conversationsDeleteEqMock
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
            direction: 'inbound',
            skipAutomation: false,
            debugMessage: {
                mid: 'ig-mid-1',
                is_unsupported: true,
                attachments: [{
                    type: 'ig_story'
                }]
            }
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

        process.env.NEXT_PUBLIC_APP_URL = 'https://app.askqualy.com'

        const req = new NextRequest('https://app.askqualy.com/api/webhooks/instagram', {
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
            inboundMessageId: 'ig-mid-1',
            inboundMessageMetadata: expect.objectContaining({
                instagram_message_id: 'ig-mid-1',
                instagram_message_debug: {
                    mid: 'ig-mid-1',
                    is_unsupported: true,
                    attachments: [{
                        type: 'ig_story'
                    }]
                }
            })
        }))
        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
            config: expect.objectContaining({
                webhook_status: 'verified',
                webhook_verified_at: expect.any(String)
            })
        }))
    })

    it('returns provider message ids from instagram outbound send callbacks', async () => {
        const event = {
            instagramBusinessAccountId: 'page-1',
            contactId: 'ig-user-1',
            contactName: 'Ayse',
            messageId: 'ig-mid-1',
            text: 'Merhaba',
            timestamp: '1738000000',
            eventSource: 'messaging',
            eventType: 'message',
            direction: 'inbound',
            skipAutomation: false
        }

        const { supabase } = createInstagramSupabaseMock({
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
        sendTextMock.mockResolvedValueOnce({ message_id: 'ig-outbound-text-1' })
        sendImageMock.mockResolvedValueOnce({ message_id: 'ig-outbound-image-1' })

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
        expect(processInboundAiPipelineMock).toHaveBeenCalledTimes(1)

        const pipelineInput = processInboundAiPipelineMock.mock.calls[0]?.[0]
        await expect(pipelineInput.sendOutbound('Bot reply')).resolves.toEqual({
            providerMessageId: 'ig-outbound-text-1'
        })
        await expect(pipelineInput.sendOutbound({
            type: 'image',
            imageUrl: 'https://example.supabase.co/storage/v1/object/public/skill-images/org-1/skill-image.webp',
            mimeType: 'image/webp'
        })).resolves.toEqual({
            providerMessageId: 'ig-outbound-image-1'
        })
        expect(sendImageMock).toHaveBeenCalledWith({
            instagramBusinessAccountId: 'page-1',
            to: 'ig-user-1',
            imageUrl: 'http://localhost/api/media/instagram-skill-image?source=https%3A%2F%2Fexample.supabase.co%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fskill-images%2Forg-1%2Fskill-image.webp'
        })
    })

    it('normalizes alternate instagram send response ids for outbound callbacks', async () => {
        const event = {
            instagramBusinessAccountId: 'page-1',
            contactId: 'ig-user-1',
            contactName: 'Ayse',
            messageId: 'ig-mid-1',
            text: 'Merhaba',
            timestamp: '1738000000',
            eventSource: 'messaging',
            eventType: 'message',
            direction: 'inbound',
            skipAutomation: false
        }

        const { supabase } = createInstagramSupabaseMock({
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
        sendTextMock.mockResolvedValueOnce({ id: 'ig-outbound-text-alt-1' })
        sendImageMock.mockResolvedValueOnce({ mid: 'ig-outbound-image-alt-1' })

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
        const pipelineInput = processInboundAiPipelineMock.mock.calls[0]?.[0]
        await expect(pipelineInput.sendOutbound('Bot reply')).resolves.toEqual({
            providerMessageId: 'ig-outbound-text-alt-1'
        })
        await expect(pipelineInput.sendOutbound({
            type: 'image',
            imageUrl: 'https://cdn.example.com/skill-image.jpg',
            mimeType: 'image/jpeg'
        })).resolves.toEqual({
            providerMessageId: 'ig-outbound-image-alt-1'
        })
    })

    it('persists structured instagram reaction metadata into inbound message metadata', async () => {
        const event = {
            instagramBusinessAccountId: 'page-1',
            contactId: 'ig-user-1',
            contactName: 'Ayse',
            messageId: 'ig-reaction-1',
            text: '[Instagram reaction] react ❤️',
            timestamp: '1738000001',
            eventSource: 'messaging',
            eventType: 'reaction',
            direction: 'inbound',
            skipAutomation: true,
            reaction: {
                action: 'react',
                emoji: '❤️',
                targetMessageId: 'ig-mid-outbound-1'
            }
        }

        const { supabase } = createInstagramSupabaseMock({
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
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            inboundMessageMetadata: expect.objectContaining({
                instagram_message_id: 'ig-reaction-1',
                instagram_event_type: 'reaction',
                instagram_reaction_action: 'react',
                instagram_reaction_emoji: '❤️',
                instagram_reaction_target_message_id: 'ig-mid-outbound-1'
            })
        }))
    })

    it('persists direct-instagram business echo messages as outbound inbox messages', async () => {
        const { supabase, messagesInsertMock, conversationsUpdateMock } =
            createInstagramOutboundPersistenceSupabaseMock()

        createClientMock.mockReturnValue(supabase)
        extractInstagramInboundEventsMock.mockReturnValue([{
            instagramBusinessAccountId: 'page-1',
            contactId: 'ig-user-1',
            contactName: null,
            messageId: 'ig-mid-echo-1',
            text: 'Tesekkur ederiz, nisan basi gibi',
            timestamp: '1738000001',
            eventSource: 'messaging',
            eventType: 'message',
            direction: 'outbound',
            skipAutomation: true
        }])
        isValidMetaSignatureMock.mockReturnValue(true)
        resolveMetaInstagramConnectionCandidateMock.mockResolvedValue(null)
        getBusinessAccountMock.mockImplementation(async (accountId: string) => {
            if (accountId === 'page-1') {
                throw new Error('Unsupported node id')
            }

            if (accountId === 'ig-biz-1') {
                return {
                    id: 'ig-biz-1',
                    username: 'sweetdreams.photography_tr',
                    name: 'Sweet Dreams',
                    profile_picture_url: 'https://cdn.example.com/business-avatar.jpg'
                }
            }

            throw new Error(`Unexpected account id: ${accountId}`)
        })
        getUserProfileMock.mockResolvedValue({
            id: 'ig-user-1',
            username: 'keskinngamzee',
            name: 'Gamze',
            profile_picture_url: 'https://cdn.example.com/gamze.jpg'
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
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
        expect(messagesInsertMock).toHaveBeenCalledWith(expect.objectContaining({
            conversation_id: 'conv-1',
            organization_id: 'org-1',
            sender_type: 'user',
            content: 'Tesekkur ederiz, nisan basi gibi',
            metadata: expect.objectContaining({
                outbound_channel: 'instagram',
                instagram_message_id: 'ig-mid-echo-1',
                instagram_event_source: 'messaging',
                instagram_event_type: 'message',
                instagram_contact_username: 'keskinngamzee',
                instagram_contact_avatar_url: 'https://cdn.example.com/gamze.jpg',
                instagram_business_username: 'sweetdreams.photography_tr',
                instagram_business_avatar_url: 'https://cdn.example.com/business-avatar.jpg'
            })
        }))
        expect(getBusinessAccountMock).toHaveBeenNthCalledWith(1, 'page-1')
        expect(getBusinessAccountMock).toHaveBeenNthCalledWith(2, 'ig-biz-1')
        expect(conversationsUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            contact_name: 'keskinngamzee',
            contact_avatar_url: 'https://cdn.example.com/gamze.jpg',
            unread_count: 2,
            tags: []
        }))
    })

    it('reuses an existing instagram conversation when the webhook recipient id changes but username still matches', async () => {
        const { supabase, messagesInsertMock, conversationsUpdateMock } =
            createInstagramOutboundFallbackConversationSupabaseMock()

        createClientMock.mockReturnValue(supabase)
        extractInstagramInboundEventsMock.mockReturnValue([{
            instagramBusinessAccountId: 'page-1',
            contactId: 'ig-recipient-new-scope',
            contactName: null,
            messageId: 'ig-mid-echo-2',
            text: 'Size bilgi verdim',
            timestamp: '1738000002',
            eventSource: 'messaging',
            eventType: 'message',
            direction: 'outbound',
            skipAutomation: true
        }])
        isValidMetaSignatureMock.mockReturnValue(true)
        resolveMetaInstagramConnectionCandidateMock.mockResolvedValue(null)
        getUserProfileMock.mockResolvedValue({
            id: 'ig-recipient-new-scope',
            username: 'serayaytemiz',
            name: 'Sera',
            profile_picture_url: 'https://cdn.example.com/sera.jpg'
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
        expect(messagesInsertMock).toHaveBeenCalledWith(expect.objectContaining({
            conversation_id: 'conv-existing',
            sender_type: 'user',
            content: 'Size bilgi verdim'
        }))
        expect(conversationsUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            contact_name: 'serayaytemiz',
            contact_avatar_url: 'https://cdn.example.com/sera.jpg'
        }))
    })

    it('prefers the older populated instagram conversation over an empty duplicate thread', async () => {
        const {
            supabase,
            messagesInsertMock,
            conversationsUpdateMock,
            conversationsDeleteEqMock
        } = createInstagramOutboundEmptyDuplicateSupabaseMock()

        createClientMock.mockReturnValue(supabase)
        extractInstagramInboundEventsMock.mockReturnValue([{
            instagramBusinessAccountId: 'page-1',
            contactId: 'ig-recipient-new-scope',
            contactName: null,
            messageId: 'ig-mid-echo-3',
            text: 'Detaylari DMden gonderdim',
            timestamp: '1738000003',
            eventSource: 'messaging',
            eventType: 'message',
            direction: 'outbound',
            skipAutomation: true
        }])
        isValidMetaSignatureMock.mockReturnValue(true)
        resolveMetaInstagramConnectionCandidateMock.mockResolvedValue(null)
        getUserProfileMock.mockResolvedValue({
            id: 'ig-recipient-new-scope',
            username: 'serayaytemiz',
            name: 'Sera',
            profile_picture_url: 'https://cdn.example.com/sera.jpg'
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
        expect(messagesInsertMock).toHaveBeenCalledWith(expect.objectContaining({
            conversation_id: 'conv-existing-history',
            sender_type: 'user',
            content: 'Detaylari DMden gonderdim'
        }))
        expect(conversationsDeleteEqMock).toHaveBeenCalledWith('id', 'conv-empty-duplicate')
        expect(conversationsUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            contact_name: 'serayaytemiz',
            contact_avatar_url: 'https://cdn.example.com/sera.jpg',
            unread_count: 1
        }))
    })
})
