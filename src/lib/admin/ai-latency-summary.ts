import { summarizeAiLatencyEvents } from '@/lib/ai/latency'

export interface AdminAiLatencyRowLike {
    organization_id: string
    metric_key: string
    duration_ms: number
}

export interface AdminAiLatencySummary {
    periodKey: string
    isAllTime: boolean
    leadExtraction: {
        sampleCount: number
        averageMs: number
        p95Ms: number
        maxMs: number
    }
    llmResponse: {
        sampleCount: number
        averageMs: number
        p95Ms: number
        maxMs: number
    }
}

export function buildAdminAiLatencySummary(input: {
    periodKey: string
    isAllTime: boolean
    rows: AdminAiLatencyRowLike[]
}): AdminAiLatencySummary {
    const summary = summarizeAiLatencyEvents(
        input.rows.map((row) => ({
            metricKey: row.metric_key,
            durationMs: row.duration_ms
        }))
    )

    return {
        periodKey: input.periodKey,
        isAllTime: input.isAllTime,
        leadExtraction: summary.leadExtraction,
        llmResponse: summary.llmResponse
    }
}
