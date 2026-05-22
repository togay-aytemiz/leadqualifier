import { describe, expect, it, vi } from 'vitest'
import { getAdminUsageMetricsSummary } from '@/lib/admin/read-models'

function createThenableResult<T>(result: T) {
    return {
        then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) => (
            Promise.resolve(result).then(resolve, reject)
        )
    }
}

describe('admin read-model usage metrics', () => {
    it('loads AI usage totals through the aggregate RPC instead of paging raw usage rows', async () => {
        const messageQuery = {
            eq: vi.fn(),
            gte: vi.fn(),
            lt: vi.fn(),
            then: (resolve: (value: { count: number; error: null }) => unknown) => (
                Promise.resolve({ count: 7, error: null }).then(resolve)
            )
        }
        messageQuery.eq.mockReturnValue(messageQuery)
        messageQuery.gte.mockReturnValue(messageQuery)
        messageQuery.lt.mockReturnValue(messageQuery)

        const fromMock = vi.fn((table: string) => {
            if (table === 'messages') {
                return { select: vi.fn(() => messageQuery) }
            }

            if (table === 'organization_ai_usage') {
                throw new Error('raw usage rows should not be paged for admin totals')
            }

            throw new Error(`Unexpected table ${table}`)
        })
        const rpcMock = vi.fn(() => createThenableResult({
            data: [{
                total_token_count: 24_000,
                input_token_count: 23_500,
                output_token_count: 500,
                embedding_token_count: 22_500,
                weighted_chat_token_count: 3_000,
                total_credit_usage: '2.0'
            }],
            error: null
        }))

        const summary = await getAdminUsageMetricsSummary({
            organizationId: 'org-1',
            periodKey: 'all'
        }, {
            from: fromMock,
            rpc: rpcMock
        } as never)

        expect(rpcMock).toHaveBeenCalledWith('get_admin_ai_usage_totals', {
            target_organization_ids: ['org-1'],
            range_start: null,
            range_end: null
        })
        expect(summary).toMatchObject({
            messageCount: 7,
            totalTokenCount: 24_000,
            inputTokenCount: 23_500,
            outputTokenCount: 500,
            embeddingTokenCount: 22_500,
            weightedChatTokenCount: 3_000,
            totalCreditUsage: 2
        })
    })
})
