import { createClient } from '@/lib/supabase/server'

export type AiLatencyMetricKey = 'lead_extraction' | 'llm_response'

export interface AiLatencyMetricStats {
    sampleCount: number
    averageMs: number
    p95Ms: number
    maxMs: number
}

export interface AiLatencyEventRowInput {
    organizationId: string
    conversationId?: string | null
    metricKey: AiLatencyMetricKey
    durationMs: number
    source: string
    metadata?: Record<string, unknown>
}

export interface AiLatencySummary {
    leadExtraction: AiLatencyMetricStats
    llmResponse: AiLatencyMetricStats
}

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

function roundMs(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.round(value))
}

function percentile(values: number[], rank: number) {
    if (values.length === 0) return 0

    const sorted = [...values].sort((left, right) => left - right)
    const normalizedRank = Math.min(Math.max(rank, 0), 1)
    const index = Math.max(0, Math.ceil(normalizedRank * sorted.length) - 1)
    return sorted[index] ?? sorted[sorted.length - 1] ?? 0
}

export function createEmptyAiLatencyMetricStats(): AiLatencyMetricStats {
    return {
        sampleCount: 0,
        averageMs: 0,
        p95Ms: 0,
        maxMs: 0
    }
}

export function buildAiLatencyEventRow(input: AiLatencyEventRowInput) {
    return {
        organization_id: input.organizationId,
        conversation_id: input.conversationId ?? null,
        metric_key: input.metricKey,
        duration_ms: roundMs(input.durationMs),
        source: input.source.trim(),
        metadata: input.metadata ?? {}
    }
}

export async function recordAiLatencyEvent(
    input: AiLatencyEventRowInput,
    options?: { supabase?: SupabaseClientLike }
) {
    const supabase = options?.supabase ?? await createClient()
    const { error } = await supabase
        .from('organization_ai_latency_events')
        .insert(buildAiLatencyEventRow(input))

    if (error) {
        console.error('Failed to record AI latency event:', error)
    }
}

function summarizeMetric(values: number[]): AiLatencyMetricStats {
    if (values.length === 0) {
        return createEmptyAiLatencyMetricStats()
    }

    const total = values.reduce((sum, value) => sum + value, 0)

    return {
        sampleCount: values.length,
        averageMs: roundMs(total / values.length),
        p95Ms: roundMs(percentile(values, 0.95)),
        maxMs: roundMs(Math.max(...values))
    }
}

export function summarizeAiLatencyEvents(events: Array<{
    metricKey: string
    durationMs: number
}>): AiLatencySummary {
    const leadExtractionValues: number[] = []
    const llmResponseValues: number[] = []

    for (const event of events) {
        const durationMs = roundMs(event.durationMs)
        if (event.metricKey === 'lead_extraction') {
            leadExtractionValues.push(durationMs)
        } else if (event.metricKey === 'llm_response') {
            llmResponseValues.push(durationMs)
        }
    }

    return {
        leadExtraction: summarizeMetric(leadExtractionValues),
        llmResponse: summarizeMetric(llmResponseValues)
    }
}
