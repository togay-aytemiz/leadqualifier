import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
    completeInboundMessageJob,
    failInboundMessageJob,
    leaseInboundMessageJobs,
    type InboundMessageJob
} from '@/lib/channels/inbound-job-queue'
import { processWhatsAppInboundJob } from '@/app/api/webhooks/whatsapp/route'
import { processInstagramInboundJob } from '@/app/api/webhooks/instagram/route'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 10

function createServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        }
    )
}

function isAuthorized(req: NextRequest) {
    const expected = process.env.INBOUND_JOBS_PROCESS_TOKEN?.trim()
    if (!expected) return false

    const header = req.headers.get('authorization')?.trim() ?? ''
    return header === `Bearer ${expected}`
}

function readLimit(req: NextRequest) {
    const raw = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10)
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT
    return Math.min(raw, MAX_LIMIT)
}

async function processJob(supabase: ReturnType<typeof createServiceClient>, job: InboundMessageJob) {
    if (job.source === 'whatsapp') {
        await processWhatsAppInboundJob({ supabase, job })
        return
    }

    if (job.source === 'instagram') {
        await processInstagramInboundJob({ supabase, job })
        return
    }

    throw new Error(`Unsupported inbound job source: ${job.source}`)
}

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const jobs = await leaseInboundMessageJobs({
        supabase,
        limit: readLimit(req)
    })
    let completed = 0
    let failed = 0

    await Promise.all(jobs.map(async (job) => {
        try {
            await processJob(supabase, job)
            await completeInboundMessageJob({ supabase, jobId: job.id })
            completed += 1
        } catch (error) {
            failed += 1
            console.error('Inbound job processor: job failed', {
                job_id: job.id,
                source: job.source,
                error: error instanceof Error ? error.message : String(error)
            })
            await failInboundMessageJob({ supabase, job, error })
        }
    }))

    return NextResponse.json({
        ok: true,
        leased: jobs.length,
        completed,
        failed
    })
}
