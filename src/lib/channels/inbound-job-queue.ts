export type InboundMessageJobSource = 'whatsapp' | 'instagram' | 'demo_chat' | 'web_chat'
export type InboundMessageJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface InboundMessageJob {
    id: string
    source: InboundMessageJobSource
    organization_id: string
    channel_id: string | null
    provider_message_id: string
    status: InboundMessageJobStatus
    attempts: number
    max_attempts: number
    payload: Record<string, unknown>
    last_error: string | null
    locked_at: string | null
    locked_until: string | null
    processed_at: string | null
    created_at: string
    updated_at: string
}

type SupabaseLike = {
    from: (table: string) => any
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_LEASE_SECONDS = 120
const DEFAULT_LEASE_LIMIT = 5

function nowIso() {
    return new Date().toISOString()
}

function addSecondsIso(date: Date, seconds: number) {
    return new Date(date.getTime() + seconds * 1000).toISOString()
}

function toErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    return 'Unknown error'
}

export async function enqueueInboundMessageJob(input: {
    supabase: SupabaseLike
    source: InboundMessageJobSource
    organizationId: string
    channelId?: string | null
    providerMessageId: string
    payload: Record<string, unknown>
    maxAttempts?: number
}) {
    const { error } = await input.supabase
        .from('inbound_message_jobs')
        .insert({
            source: input.source,
            organization_id: input.organizationId,
            channel_id: input.channelId ?? null,
            provider_message_id: input.providerMessageId,
            status: 'pending',
            attempts: 0,
            max_attempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
            payload: input.payload,
            last_error: null,
            locked_at: null,
            locked_until: null,
            processed_at: null
        })

    if (error) {
        if (error.code === '23505') {
            return { queued: true, duplicate: true }
        }
        throw error
    }

    return { queued: true, duplicate: false }
}

export async function leaseInboundMessageJobs(input: {
    supabase: SupabaseLike
    limit?: number
    leaseSeconds?: number
    source?: InboundMessageJobSource
}) {
    const now = new Date()
    const nowValue = now.toISOString()
    const lockedUntil = addSecondsIso(now, input.leaseSeconds ?? DEFAULT_LEASE_SECONDS)
    const limit = input.limit ?? DEFAULT_LEASE_LIMIT

    let query = input.supabase
        .from('inbound_message_jobs')
        .update({
            status: 'processing',
            locked_at: nowValue,
            locked_until: lockedUntil,
            updated_at: nowValue
        })
        .or(`status.eq.pending,and(status.eq.processing,locked_until.lt.${nowValue})`)

    if (input.source) {
        query = query.eq('source', input.source)
    }

    const { data, error } = await query
        .select('*')
        .order('created_at', { ascending: true })
        .limit(limit)

    if (error) throw error

    return (data ?? []) as InboundMessageJob[]
}

export async function completeInboundMessageJob(input: {
    supabase: SupabaseLike
    jobId: string
}) {
    const nowValue = nowIso()
    const { error } = await input.supabase
        .from('inbound_message_jobs')
        .update({
            status: 'completed',
            processed_at: nowValue,
            updated_at: nowValue,
            locked_at: null,
            locked_until: null,
            last_error: null
        })
        .eq('id', input.jobId)

    if (error) throw error
}

export async function failInboundMessageJob(input: {
    supabase: SupabaseLike
    job: Pick<InboundMessageJob, 'id' | 'attempts' | 'max_attempts'>
    error: unknown
}) {
    const nowValue = nowIso()
    const nextAttempts = input.job.attempts + 1
    const exhausted = nextAttempts >= input.job.max_attempts
    const { error } = await input.supabase
        .from('inbound_message_jobs')
        .update({
            status: exhausted ? 'failed' : 'pending',
            attempts: nextAttempts,
            last_error: toErrorMessage(input.error).slice(0, 2000),
            updated_at: nowValue,
            locked_at: null,
            locked_until: null
        })
        .eq('id', input.job.id)

    if (error) throw error
}
