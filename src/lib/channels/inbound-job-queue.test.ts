import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    completeInboundMessageJob,
    enqueueInboundMessageJob,
    failInboundMessageJob,
    leaseInboundMessageJobs,
    type InboundMessageJob
} from './inbound-job-queue'

type QueryResult = { data?: unknown; error?: { code?: string; message?: string } | null }

function createTableMock(results: QueryResult[]) {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const nextResult = async () => {
        const result = results.shift()
        return result ?? { data: null, error: null }
    }
    const builder: Record<string, unknown> = {
        calls,
        insert: vi.fn((...args: unknown[]) => {
            calls.push({ method: 'insert', args })
            return builder
        }),
        update: vi.fn((...args: unknown[]) => {
            calls.push({ method: 'update', args })
            return builder
        }),
        select: vi.fn((...args: unknown[]) => {
            calls.push({ method: 'select', args })
            return builder
        }),
        eq: vi.fn((...args: unknown[]) => {
            calls.push({ method: 'eq', args })
            return builder
        }),
        in: vi.fn((...args: unknown[]) => {
            calls.push({ method: 'in', args })
            return builder
        }),
        or: vi.fn((...args: unknown[]) => {
            calls.push({ method: 'or', args })
            return builder
        }),
        order: vi.fn((...args: unknown[]) => {
            calls.push({ method: 'order', args })
            return builder
        }),
        limit: vi.fn((...args: unknown[]) => {
            calls.push({ method: 'limit', args })
            return nextResult()
        }),
        single: vi.fn(nextResult)
    }
    builder.then = (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
        nextResult().then(resolve, reject)

    const supabase = {
        from: vi.fn((table: string) => {
            if (table !== 'inbound_message_jobs') {
                throw new Error(`Unexpected table ${table}`)
            }
            return builder
        })
    }

    return { supabase, builder, calls }
}

describe('inbound job queue', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'))
    })

    it('treats duplicate provider message enqueue as already queued', async () => {
        const { supabase, calls } = createTableMock([{
            error: { code: '23505', message: 'duplicate key value violates unique constraint' }
        }])

        const result = await enqueueInboundMessageJob({
            supabase,
            source: 'whatsapp',
            organizationId: 'org-1',
            channelId: 'channel-1',
            providerMessageId: 'wamid-1',
            payload: { event: { text: 'Merhaba' } }
        })

        expect(result).toEqual({ queued: true, duplicate: true })
        expect(calls[0]).toMatchObject({
            method: 'insert',
            args: [expect.objectContaining({
                source: 'whatsapp',
                status: 'pending',
                provider_message_id: 'wamid-1',
                attempts: 0
            })]
        })
    })

    it('leases pending jobs with an expiry window and attempt increment', async () => {
        const leasedJob: InboundMessageJob = {
            id: 'job-1',
            source: 'instagram',
            organization_id: 'org-1',
            channel_id: 'channel-1',
            provider_message_id: 'igmid-1',
            status: 'processing',
            attempts: 1,
            max_attempts: 3,
            payload: { event: { text: 'Selam' } },
            last_error: null,
            locked_at: '2026-07-03T12:00:00.000Z',
            locked_until: '2026-07-03T12:02:00.000Z',
            processed_at: null,
            created_at: '2026-07-03T12:00:00.000Z',
            updated_at: '2026-07-03T12:00:00.000Z'
        }
        const { supabase, calls } = createTableMock([{ data: [leasedJob], error: null }])

        const jobs = await leaseInboundMessageJobs({ supabase, limit: 2, leaseSeconds: 120 })

        expect(jobs).toEqual([leasedJob])
        expect(calls).toEqual(expect.arrayContaining([
            { method: 'update', args: [expect.objectContaining({
                status: 'processing',
                locked_at: '2026-07-03T12:00:00.000Z',
                locked_until: '2026-07-03T12:02:00.000Z'
            })] },
            { method: 'or', args: ['status.eq.pending,and(status.eq.processing,locked_until.lt.2026-07-03T12:00:00.000Z)'] },
            { method: 'limit', args: [2] }
        ]))
    })

    it('marks completed jobs terminally processed', async () => {
        const { supabase, calls } = createTableMock([{ data: null, error: null }])

        await completeInboundMessageJob({ supabase, jobId: 'job-1' })

        expect(calls).toEqual(expect.arrayContaining([
            { method: 'update', args: [expect.objectContaining({
                status: 'completed',
                processed_at: '2026-07-03T12:00:00.000Z',
                locked_until: null,
                last_error: null
            })] },
            { method: 'eq', args: ['id', 'job-1'] }
        ]))
    })

    it('returns failed jobs to pending until max attempts is reached', async () => {
        const { supabase, calls } = createTableMock([{ data: null, error: null }])

        await failInboundMessageJob({
            supabase,
            job: { id: 'job-1', attempts: 1, max_attempts: 3 },
            error: new Error('rate limited')
        })

        expect(calls[0]).toMatchObject({
            method: 'update',
            args: [expect.objectContaining({
                status: 'pending',
                attempts: 2,
                last_error: 'rate limited',
                locked_at: null,
                locked_until: null
            })]
        })
    })

    it('marks exhausted jobs failed', async () => {
        const { supabase, calls } = createTableMock([{ data: null, error: null }])

        await failInboundMessageJob({
            supabase,
            job: { id: 'job-1', attempts: 3, max_attempts: 3 },
            error: 'still failing'
        })

        expect(calls[0]).toMatchObject({
            method: 'update',
            args: [expect.objectContaining({
                status: 'failed',
                attempts: 4,
                last_error: 'still failing'
            })]
        })
    })
})
