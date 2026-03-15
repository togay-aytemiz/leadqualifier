import { describe, expect, it } from 'vitest'

import {
    buildAiLatencyEventRow,
    createEmptyAiLatencyMetricStats,
    summarizeAiLatencyEvents
} from '@/lib/ai/latency'

describe('ai latency helpers', () => {
    it('builds a persisted latency row with normalized metadata', () => {
        expect(buildAiLatencyEventRow({
            organizationId: 'org-1',
            conversationId: 'conv-1',
            metricKey: 'lead_extraction',
            durationMs: 4384,
            source: 'whatsapp',
            metadata: {
                route: 'webhook',
                response_kind: 'fallback'
            }
        })).toEqual({
            organization_id: 'org-1',
            conversation_id: 'conv-1',
            metric_key: 'lead_extraction',
            duration_ms: 4384,
            source: 'whatsapp',
            metadata: {
                route: 'webhook',
                response_kind: 'fallback'
            }
        })
    })

    it('returns empty stats when no latency samples exist', () => {
        expect(createEmptyAiLatencyMetricStats()).toEqual({
            sampleCount: 0,
            averageMs: 0,
            p95Ms: 0,
            maxMs: 0
        })
    })

    it('summarizes average and p95 by metric key', () => {
        const summary = summarizeAiLatencyEvents([
            { metricKey: 'lead_extraction', durationMs: 3200 },
            { metricKey: 'lead_extraction', durationMs: 4100 },
            { metricKey: 'lead_extraction', durationMs: 5200 },
            { metricKey: 'llm_response', durationMs: 1800 },
            { metricKey: 'llm_response', durationMs: 2100 },
            { metricKey: 'llm_response', durationMs: 2600 },
            { metricKey: 'llm_response', durationMs: 3400 }
        ])

        expect(summary.leadExtraction).toEqual({
            sampleCount: 3,
            averageMs: 4167,
            p95Ms: 5200,
            maxMs: 5200
        })
        expect(summary.llmResponse).toEqual({
            sampleCount: 4,
            averageMs: 2475,
            p95Ms: 3400,
            maxMs: 3400
        })
    })
})
