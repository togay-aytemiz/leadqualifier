import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

import { getLeads } from '@/lib/leads/list-actions'

function createLeadsQueryMock(result: { data: unknown[]; count: number; error: unknown }) {
    const rangeMock = vi.fn(async () => result)
    const orderMock = vi.fn(() => ({ range: rangeMock }))
    const ilikeMock = vi.fn(() => ({ order: orderMock }))
    const eqMock = vi.fn(() => ({
        ilike: ilikeMock,
        order: orderMock
    }))
    const selectMock = vi.fn(() => ({
        eq: eqMock
    }))
    const fromMock = vi.fn(() => ({
        select: selectMock
    }))

    return {
        supabase: {
            from: fromMock
        },
        fromMock,
        selectMock,
        eqMock,
        ilikeMock,
        orderMock,
        rangeMock
    }
}

describe('getLeads', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('selects conversation avatar url for leads identity rows', async () => {
        const { supabase, selectMock } = createLeadsQueryMock({
            data: [{
                id: 'lead-1',
                conversation_id: 'conv-1',
                organization_id: 'org-1',
                status: 'hot',
                total_score: 91,
                extracted_fields: {},
                created_at: '2026-03-12T09:00:00.000Z',
                updated_at: '2026-03-12T10:00:00.000Z',
                conversation: {
                    contact_name: 'ibrahimkilic634',
                    contact_avatar_url: 'https://cdn.example.com/avatar.jpg',
                    platform: 'instagram'
                }
            }],
            count: 1,
            error: null
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await getLeads({}, 'org-1')

        expect(selectMock).toHaveBeenCalledWith(expect.stringContaining('contact_avatar_url'), { count: 'exact' })
        expect(result.leads[0]?.conversation).toEqual(expect.objectContaining({
            contact_avatar_url: 'https://cdn.example.com/avatar.jpg'
        }))
    })
})
