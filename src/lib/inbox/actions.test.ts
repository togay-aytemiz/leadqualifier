import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    assertTenantWriteAllowedMock,
    createClientMock,
    getMessageTemplatesMock,
    sendTemplateMock,
    whatsAppCtorMock
} = vi.hoisted(() => ({
    assertTenantWriteAllowedMock: vi.fn(),
    createClientMock: vi.fn(),
    getMessageTemplatesMock: vi.fn(),
    sendTemplateMock: vi.fn(),
    whatsAppCtorMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/organizations/active-context', () => ({
    assertTenantWriteAllowed: assertTenantWriteAllowedMock
}))

vi.mock('@/lib/billing/entitlements', () => ({
    resolveOrganizationUsageEntitlement: vi.fn(async () => ({
        isUsageAllowed: true
    }))
}))

vi.mock('@/lib/whatsapp/client', () => ({
    WhatsAppClient: class {
        constructor(token: string) {
            whatsAppCtorMock(token)
        }

        getMessageTemplates = getMessageTemplatesMock
        sendTemplate = sendTemplateMock
    }
}))

import {
    getConversations,
    createConversationPredefinedTemplate,
    deleteConversationPredefinedTemplate,
    listConversationWhatsAppTemplates,
    listConversationPredefinedTemplates,
    sendConversationWhatsAppTemplateMessage,
    setConversationAgent,
    setConversationAiProcessingPaused,
    updateConversationPredefinedTemplate,
    type ConversationListItem
} from '@/lib/inbox/actions'
import type { Conversation } from '@/types/database'

type QueryResult<T = unknown> = {
    data: T
    error: unknown
}

type QueryBuilderConfig = {
    rangeResult?: QueryResult
    orderResult?: QueryResult
    inResult?: QueryResult
}

function createQueryBuilder(config: QueryBuilderConfig = {}) {
    const builder: Record<string, unknown> = {}

    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.limit = vi.fn(() => builder)
    builder.order = vi.fn(() => {
        if (config.orderResult) {
            return Promise.resolve(config.orderResult)
        }
        return builder
    })
    builder.range = vi.fn(() => Promise.resolve(config.rangeResult ?? { data: [], error: null }))
    builder.in = vi.fn(() => {
        if (config.inResult) {
            return Promise.resolve(config.inResult)
        }
        return builder
    })

    return builder
}

function createSupabaseMock(plan: Record<string, ReturnType<typeof createQueryBuilder>[]>) {
    return {
        from: vi.fn((table: string) => {
            const queue = plan[table]
            if (!queue || queue.length === 0) {
                throw new Error(`Unexpected query for table: ${table}`)
            }
            const next = queue.shift()
            if (!next) {
                throw new Error(`No query builder configured for table: ${table}`)
            }
            return next
        }),
        rpc: vi.fn(async () => ({ data: null, error: null }))
    }
}

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
    return {
        id: 'conv-1',
        organization_id: 'org-1',
        contact_name: 'Test Contact',
        contact_phone: '+905555555555',
        platform: 'whatsapp',
        status: 'open',
        assignee_id: 'profile-1',
        active_agent: 'bot',
        ai_processing_paused: false,
        last_message_at: '2026-02-08T10:00:00.000Z',
        unread_count: 0,
        tags: [],
        created_at: '2026-02-08T09:00:00.000Z',
        updated_at: '2026-02-08T10:00:00.000Z',
        ...overrides
    }
}

describe('getConversations', () => {
    beforeEach(() => {
        createClientMock.mockReset()
        assertTenantWriteAllowedMock.mockResolvedValue(undefined)
        getMessageTemplatesMock.mockResolvedValue({
            data: [
                {
                    id: 'tpl-1',
                    name: 'hello_world',
                    status: 'APPROVED',
                    language: 'en_US',
                    category: 'UTILITY'
                }
            ]
        })
        sendTemplateMock.mockResolvedValue({
            messages: [{ id: 'wamid.template.1' }]
        })
    })

    it('returns primary nested query data when available', async () => {
        const nestedConversation: ConversationListItem = {
            ...createConversation(),
            assignee: {
                full_name: 'Test User',
                email: 'test@example.com'
            },
            leads: [{ status: 'hot' }],
            messages: [{
                content: 'Merhaba',
                created_at: '2026-02-08T10:00:00.000Z',
                sender_type: 'contact'
            }]
        }

        const supabaseMock = createSupabaseMock({
            conversations: [
                createQueryBuilder({
                    rangeResult: {
                        data: [nestedConversation],
                        error: null
                    }
                })
            ]
        })

        createClientMock.mockResolvedValue(supabaseMock)

        const result = await getConversations('org-1')

        expect(result).toEqual([nestedConversation])
    })

    it('normalizes one-to-one lead payloads from nested query into an array', async () => {
        const rawConversation = {
            ...createConversation(),
            assignee: {
                full_name: 'Test User',
                email: 'test@example.com'
            },
            leads: {
                status: 'cold'
            },
            messages: [{
                content: 'Selam',
                created_at: '2026-02-08T10:00:00.000Z',
                sender_type: 'contact'
            }]
        }

        const supabaseMock = createSupabaseMock({
            conversations: [
                createQueryBuilder({
                    rangeResult: {
                        data: [rawConversation],
                        error: null
                    }
                })
            ]
        })

        createClientMock.mockResolvedValue(supabaseMock)

        const result = await getConversations('org-1')

        expect(Array.isArray(result[0]?.leads)).toBe(true)
        expect(result[0]?.leads?.[0]?.status).toBe('cold')
    })

    it('falls back to flat queries when primary nested query fails', async () => {
        const baseConversation = createConversation()

        const supabaseMock = createSupabaseMock({
            conversations: [
                createQueryBuilder({
                    rangeResult: {
                        data: null,
                        error: { message: 'PGRST100 nested query failed' }
                    }
                }),
                createQueryBuilder({
                    rangeResult: {
                        data: [baseConversation],
                        error: null
                    }
                })
            ],
            messages: [
                createQueryBuilder({
                    orderResult: {
                        data: [{
                            conversation_id: baseConversation.id,
                            content: 'En son mesaj',
                            created_at: '2026-02-08T10:00:00.000Z',
                            sender_type: 'contact'
                        }],
                        error: null
                    }
                })
            ],
            leads: [
                createQueryBuilder({
                    inResult: {
                        data: [{
                            conversation_id: baseConversation.id,
                            status: 'warm'
                        }],
                        error: null
                    }
                })
            ],
            profiles: [
                createQueryBuilder({
                    inResult: {
                        data: [{
                            id: 'profile-1',
                            full_name: 'Operator One',
                            email: 'operator@example.com'
                        }],
                        error: null
                    }
                })
            ]
        })

        createClientMock.mockResolvedValue(supabaseMock)

        const result = await getConversations('org-1')

        expect(result).toHaveLength(1)
        expect(result[0]?.id).toBe(baseConversation.id)
        expect(result[0]?.messages?.[0]?.content).toBe('En son mesaj')
        expect(result[0]?.leads?.[0]?.status).toBe('warm')
        expect(result[0]?.assignee?.email).toBe('operator@example.com')
    })
})

function createConversationTemplateSupabaseMock(options: {
    conversation: {
        platform: string
        contact_phone: string | null
        organization_id: string
    } | null
    channelConfig?: Record<string, unknown> | null
    rpcData?: unknown
}) {
    const conversationSingleMock = vi.fn(async () => ({
        data: options.conversation,
        error: null
    }))
    const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
    const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

    const channelSingleMock = vi.fn(async () => ({
        data: options.channelConfig ? { config: options.channelConfig } : null,
        error: null
    }))
    const channelEqStatusMock = vi.fn(() => ({ single: channelSingleMock }))
    const channelEqTypeMock = vi.fn(() => ({ eq: channelEqStatusMock }))
    const channelEqOrgMock = vi.fn(() => ({ eq: channelEqTypeMock }))
    const channelSelectMock = vi.fn(() => ({ eq: channelEqOrgMock }))

    const rpcMock = vi.fn(async () => ({
        data: options.rpcData ?? {
            message: {
                id: 'msg-1'
            },
            conversation: {
                id: 'conv-1'
            }
        },
        error: null
    }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'conversations') {
            return {
                select: conversationSelectMock
            }
        }

        if (table === 'channels') {
            return {
                select: channelSelectMock
            }
        }

        throw new Error(`Unexpected query for table: ${table}`)
    })

    return {
        supabase: {
            from: fromMock,
            rpc: rpcMock
        },
        rpcMock,
        conversationEqMock,
        channelEqOrgMock,
        channelEqTypeMock,
        channelEqStatusMock
    }
}

describe('inbox WhatsApp template actions', () => {
    beforeEach(() => {
        createClientMock.mockReset()
        assertTenantWriteAllowedMock.mockResolvedValue(undefined)
        getMessageTemplatesMock.mockResolvedValue({
            data: [
                {
                    id: 'tpl-1',
                    name: 'hello_world',
                    status: 'APPROVED',
                    language: 'en_US',
                    category: 'UTILITY'
                }
            ]
        })
        sendTemplateMock.mockResolvedValue({
            messages: [{ id: 'wamid.template.1' }]
        })
    })

    it('lists WhatsApp templates for a conversation', async () => {
        const { supabase } = createConversationTemplateSupabaseMock({
            conversation: {
                platform: 'whatsapp',
                contact_phone: '905551112233',
                organization_id: 'org-1'
            },
            channelConfig: {
                permanent_access_token: 'token-1',
                business_account_id: 'waba-1',
                phone_number_id: 'phone-1'
            }
        })
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await listConversationWhatsAppTemplates('conv-1')

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.templates[0]?.name).toBe('hello_world')
        }
        expect(whatsAppCtorMock).toHaveBeenCalledWith('token-1')
        expect(getMessageTemplatesMock).toHaveBeenCalledWith('waba-1')
    })

    it('sends a WhatsApp template message to conversation contact', async () => {
        const { supabase, rpcMock } = createConversationTemplateSupabaseMock({
            conversation: {
                platform: 'whatsapp',
                contact_phone: '905551112233',
                organization_id: 'org-1'
            },
            channelConfig: {
                permanent_access_token: 'token-1',
                business_account_id: 'waba-1',
                phone_number_id: 'phone-1'
            }
        })
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await sendConversationWhatsAppTemplateMessage({
            conversationId: 'conv-1',
            templateName: 'appointment_reminder',
            languageCode: 'tr',
            bodyParameters: ['Ali']
        })

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.messageId).toBe('wamid.template.1')
        }
        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
        expect(sendTemplateMock).toHaveBeenCalledWith({
            phoneNumberId: 'phone-1',
            to: '905551112233',
            templateName: 'appointment_reminder',
            languageCode: 'tr',
            bodyParameters: ['Ali']
        })
        expect(rpcMock).toHaveBeenCalledWith('send_operator_message', {
            p_conversation_id: 'conv-1',
            p_content: 'Template: appointment_reminder'
        })
    })
})

describe('inbox predefined template actions', () => {
    beforeEach(() => {
        createClientMock.mockReset()
        assertTenantWriteAllowedMock.mockResolvedValue({
            userId: 'user-1'
        })
    })

    it('lists predefined templates for a conversation organization', async () => {
        const templateRows = [{
            id: 'tpl-1',
            title: 'Karsilama',
            content: 'Merhaba, nasil yardimci olabilirim?',
            updated_at: '2026-02-26T09:00:00.000Z'
        }]

        const conversationSingleMock = vi.fn(async () => ({
            data: {
                organization_id: 'org-1',
                platform: 'whatsapp',
                contact_phone: '905551112233'
            },
            error: null
        }))
        const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
        const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

        const templateOrderMock = vi.fn(async () => ({
            data: templateRows,
            error: null
        }))
        const templateEqMock = vi.fn(() => ({ order: templateOrderMock }))
        const templateSelectMock = vi.fn(() => ({ eq: templateEqMock }))

        const supabase = {
            from: vi.fn((table: string) => {
                if (table === 'conversations') {
                    return { select: conversationSelectMock }
                }
                if (table === 'inbox_predefined_templates') {
                    return { select: templateSelectMock }
                }
                throw new Error(`Unexpected query for table: ${table}`)
            })
        }
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await listConversationPredefinedTemplates('conv-1')

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.templates).toEqual([{
                id: 'tpl-1',
                title: 'Karsilama',
                content: 'Merhaba, nasil yardimci olabilirim?'
            }])
        }
    })

    it('creates a predefined template for the conversation organization', async () => {
        const insertedRow = {
            id: 'tpl-1',
            organization_id: 'org-1',
            title: 'Karsilama',
            content: 'Merhaba, nasil yardimci olabilirim?',
            created_by: 'user-1',
            updated_by: 'user-1',
            created_at: '2026-02-26T09:00:00.000Z',
            updated_at: '2026-02-26T09:00:00.000Z'
        }

        const conversationSingleMock = vi.fn(async () => ({
            data: {
                organization_id: 'org-1',
                platform: 'whatsapp',
                contact_phone: '905551112233'
            },
            error: null
        }))
        const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
        const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

        const templateSingleMock = vi.fn(async () => ({ data: insertedRow, error: null }))
        const templateSelectMock = vi.fn(() => ({ single: templateSingleMock }))
        const templateInsertMock = vi.fn(() => ({ select: templateSelectMock }))

        const supabase = {
            from: vi.fn((table: string) => {
                if (table === 'conversations') {
                    return { select: conversationSelectMock }
                }
                if (table === 'inbox_predefined_templates') {
                    return { insert: templateInsertMock }
                }
                throw new Error(`Unexpected query for table: ${table}`)
            })
        }
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await createConversationPredefinedTemplate({
            conversationId: 'conv-1',
            title: 'Karsilama',
            content: 'Merhaba, nasil yardimci olabilirim?'
        })

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.template.title).toBe('Karsilama')
            expect(result.template.content).toContain('Merhaba')
        }
        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
    })

    it('returns validation error for invalid predefined template payload', async () => {
        createClientMock.mockResolvedValueOnce({})

        const result = await createConversationPredefinedTemplate({
            conversationId: 'conv-1',
            title: '   ',
            content: '   '
        })

        expect(result).toEqual({ ok: false, reason: 'validation' })
    })

    it('updates a predefined template for the conversation organization', async () => {
        const updatedRow = {
            id: 'tpl-1',
            organization_id: 'org-1',
            title: 'Guncel Karsilama',
            content: 'Yeni metin',
            created_by: 'user-1',
            updated_by: 'user-1',
            created_at: '2026-02-26T09:00:00.000Z',
            updated_at: '2026-02-26T10:00:00.000Z'
        }

        const conversationSingleMock = vi.fn(async () => ({
            data: {
                organization_id: 'org-1',
                platform: 'whatsapp',
                contact_phone: '905551112233'
            },
            error: null
        }))
        const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
        const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

        const templateMaybeSingleMock = vi.fn(async () => ({ data: updatedRow, error: null }))
        const templateSelectMock = vi.fn(() => ({ maybeSingle: templateMaybeSingleMock }))
        const templateEqTemplateIdMock = vi.fn(() => ({ select: templateSelectMock }))
        const templateEqOrgMock = vi.fn(() => ({ eq: templateEqTemplateIdMock }))
        const templateUpdateMock = vi.fn(() => ({ eq: templateEqOrgMock }))

        const supabase = {
            from: vi.fn((table: string) => {
                if (table === 'conversations') {
                    return { select: conversationSelectMock }
                }
                if (table === 'inbox_predefined_templates') {
                    return { update: templateUpdateMock }
                }
                throw new Error(`Unexpected query for table: ${table}`)
            })
        }
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await updateConversationPredefinedTemplate({
            conversationId: 'conv-1',
            templateId: 'tpl-1',
            title: 'Guncel Karsilama',
            content: 'Yeni metin'
        })

        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.template.title).toBe('Guncel Karsilama')
        }
        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
    })

    it('deletes a predefined template for the conversation organization', async () => {
        const conversationSingleMock = vi.fn(async () => ({
            data: {
                organization_id: 'org-1',
                platform: 'whatsapp',
                contact_phone: '905551112233'
            },
            error: null
        }))
        const conversationEqMock = vi.fn(() => ({ single: conversationSingleMock }))
        const conversationSelectMock = vi.fn(() => ({ eq: conversationEqMock }))

        const templateEqTemplateIdMock = vi.fn(async () => ({ error: null }))
        const templateEqOrgMock = vi.fn(() => ({ eq: templateEqTemplateIdMock }))
        const templateDeleteMock = vi.fn(() => ({ eq: templateEqOrgMock }))

        const supabase = {
            from: vi.fn((table: string) => {
                if (table === 'conversations') {
                    return { select: conversationSelectMock }
                }
                if (table === 'inbox_predefined_templates') {
                    return { delete: templateDeleteMock }
                }
                throw new Error(`Unexpected query for table: ${table}`)
            })
        }
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await deleteConversationPredefinedTemplate({
            conversationId: 'conv-1',
            templateId: 'tpl-1'
        })

        expect(result).toEqual({ ok: true })
        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
    })
})

describe('setConversationAiProcessingPaused', () => {
    beforeEach(() => {
        createClientMock.mockReset()
        assertTenantWriteAllowedMock.mockResolvedValue(undefined)
    })

    it('updates pause flag and returns normalized payload', async () => {
        const singleMock = vi.fn(async () => ({
            data: {
                id: 'conv-1',
                ai_processing_paused: true
            },
            error: null
        }))
        const selectMock = vi.fn(() => ({ single: singleMock }))
        const eqMock = vi.fn(() => ({ select: selectMock }))
        const updateMock = vi.fn(() => ({ eq: eqMock }))
        const fromMock = vi.fn((table: string) => {
            if (table !== 'conversations') {
                throw new Error(`Unexpected query for table: ${table}`)
            }
            return {
                update: updateMock
            }
        })

        const supabase = { from: fromMock }
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await setConversationAiProcessingPaused('conv-1', true)

        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
            ai_processing_paused: true
        }))
        expect(eqMock).toHaveBeenCalledWith('id', 'conv-1')
        expect(selectMock).toHaveBeenCalledWith('id, ai_processing_paused')
        expect(result).toEqual({
            id: 'conv-1',
            ai_processing_paused: true
        })
    })
})

describe('setConversationAgent', () => {
    beforeEach(() => {
        createClientMock.mockReset()
        assertTenantWriteAllowedMock.mockResolvedValue(undefined)
    })

    it('clears assignee and attention fields when switching back to bot', async () => {
        const eqMock = vi.fn(async () => ({ error: null }))
        const updateMock = vi.fn(() => ({ eq: eqMock }))
        const fromMock = vi.fn((table: string) => {
            if (table !== 'conversations') {
                throw new Error(`Unexpected query for table: ${table}`)
            }
            return { update: updateMock }
        })
        const supabase = { from: fromMock }
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await setConversationAgent('conv-1', 'bot')

        expect(result).toBe(true)
        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
            active_agent: 'bot',
            assignee_id: null,
            human_attention_required: false,
            human_attention_reason: null,
            human_attention_requested_at: null,
            human_attention_resolved_at: expect.any(String)
        }))
    })
})
