import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    revalidatePathMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    revalidatePathMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('next/cache', () => ({
    revalidatePath: revalidatePathMock
}))

import { getCollections } from '@/lib/knowledge-base/actions'

function createCollectionsSupabase() {
    const collectionsEqMock = vi.fn(async () => ({
        data: [
            {
                id: 'col-1',
                organization_id: 'org-1',
                name: 'FAQ',
                description: null,
                icon: 'folder',
                created_at: '2026-03-26T09:00:00.000Z'
            },
            {
                id: 'col-2',
                organization_id: 'org-1',
                name: 'Policies',
                description: null,
                icon: 'folder',
                created_at: '2026-03-26T09:30:00.000Z'
            }
        ],
        error: null
    }))
    const collectionsOrderMock = vi.fn(() => ({
        eq: collectionsEqMock
    }))
    const collectionsSelectMock = vi.fn(() => ({
        order: collectionsOrderMock
    }))
    const fromMock = vi.fn((table: string) => {
        if (table === 'knowledge_documents') {
            throw new Error('collection counts should use aggregated rpc, not document row scans')
        }

        if (table !== 'knowledge_collections') {
            throw new Error(`Unexpected table ${table}`)
        }

        return {
            select: collectionsSelectMock
        }
    })
    const rpcMock = vi.fn(async () => ({
        data: [
            { collection_id: 'col-1', document_count: 3 },
            { collection_id: 'col-2', document_count: 1 }
        ],
        error: null
    }))

    return {
        supabase: {
            from: fromMock,
            rpc: rpcMock
        },
        fromMock,
        rpcMock
    }
}

describe('getCollections', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses aggregated collection counts instead of scanning knowledge_documents rows', async () => {
        const { supabase, fromMock, rpcMock } = createCollectionsSupabase()
        createClientMock.mockResolvedValue(supabase)

        const result = await getCollections('org-1')

        expect(rpcMock).toHaveBeenCalledWith('count_knowledge_documents_by_collection', {
            target_organization_id: 'org-1'
        })
        expect(fromMock).toHaveBeenCalledTimes(1)
        expect(result).toEqual([
            expect.objectContaining({ id: 'col-1', count: 3 }),
            expect.objectContaining({ id: 'col-2', count: 1 })
        ])
    })
})
