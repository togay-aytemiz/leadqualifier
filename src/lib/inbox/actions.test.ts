import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

import { getConversations, type ConversationListItem } from '@/lib/inbox/actions'
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
        })
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
                status: 'ignored'
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
        expect(result[0]?.leads?.[0]?.status).toBe('ignored')
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
