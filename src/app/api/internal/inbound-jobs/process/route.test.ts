import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    completeInboundMessageJobMock,
    createClientMock,
    failInboundMessageJobMock,
    leaseInboundMessageJobsMock,
    processInstagramInboundJobMock,
    processWhatsAppInboundJobMock
} = vi.hoisted(() => ({
    completeInboundMessageJobMock: vi.fn(),
    createClientMock: vi.fn(),
    failInboundMessageJobMock: vi.fn(),
    leaseInboundMessageJobsMock: vi.fn(),
    processInstagramInboundJobMock: vi.fn(),
    processWhatsAppInboundJobMock: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/channels/inbound-job-queue', () => ({
    completeInboundMessageJob: completeInboundMessageJobMock,
    failInboundMessageJob: failInboundMessageJobMock,
    leaseInboundMessageJobs: leaseInboundMessageJobsMock
}))

vi.mock('@/app/api/webhooks/whatsapp/route', () => ({
    processWhatsAppInboundJob: processWhatsAppInboundJobMock
}))

vi.mock('@/app/api/webhooks/instagram/route', () => ({
    processInstagramInboundJob: processInstagramInboundJobMock
}))

import { POST } from './route'

describe('inbound job processor route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
        process.env.INBOUND_JOBS_PROCESS_TOKEN = 'processor-token'
        createClientMock.mockReturnValue({ from: vi.fn() })
        completeInboundMessageJobMock.mockResolvedValue(undefined)
        failInboundMessageJobMock.mockResolvedValue(undefined)
        processWhatsAppInboundJobMock.mockResolvedValue(undefined)
        processInstagramInboundJobMock.mockResolvedValue(undefined)
    })

    it('rejects requests without the processor bearer token', async () => {
        const req = new NextRequest('http://localhost/api/internal/inbound-jobs/process', {
            method: 'POST'
        })

        const res = await POST(req)

        expect(res.status).toBe(401)
        expect(leaseInboundMessageJobsMock).not.toHaveBeenCalled()
    })

    it('leases and completes supported channel jobs', async () => {
        const jobs = [
            { id: 'job-wa', source: 'whatsapp', attempts: 1, max_attempts: 3 },
            { id: 'job-ig', source: 'instagram', attempts: 1, max_attempts: 3 }
        ]
        leaseInboundMessageJobsMock.mockResolvedValue(jobs)

        const req = new NextRequest('http://localhost/api/internal/inbound-jobs/process?limit=2', {
            method: 'POST',
            headers: {
                authorization: 'Bearer processor-token'
            }
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            ok: true,
            leased: 2,
            completed: 2,
            failed: 0
        })
        expect(leaseInboundMessageJobsMock).toHaveBeenCalledWith(expect.objectContaining({
            limit: 2
        }))
        expect(processWhatsAppInboundJobMock).toHaveBeenCalledWith(expect.objectContaining({
            job: jobs[0]
        }))
        expect(processInstagramInboundJobMock).toHaveBeenCalledWith(expect.objectContaining({
            job: jobs[1]
        }))
        expect(completeInboundMessageJobMock).toHaveBeenCalledTimes(2)
        expect(failInboundMessageJobMock).not.toHaveBeenCalled()
    })

    it('marks errored jobs for retry through the queue helper', async () => {
        const job = { id: 'job-wa', source: 'whatsapp', attempts: 1, max_attempts: 3 }
        leaseInboundMessageJobsMock.mockResolvedValue([job])
        processWhatsAppInboundJobMock.mockRejectedValueOnce(new Error('OpenAI rate limited'))

        const req = new NextRequest('http://localhost/api/internal/inbound-jobs/process', {
            method: 'POST',
            headers: {
                authorization: 'Bearer processor-token'
            }
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({
            ok: true,
            leased: 1,
            completed: 0,
            failed: 1
        })
        expect(failInboundMessageJobMock).toHaveBeenCalledWith(expect.objectContaining({
            job,
            error: expect.any(Error)
        }))
    })
})
