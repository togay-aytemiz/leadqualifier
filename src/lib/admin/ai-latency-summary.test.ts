import { describe, expect, it } from 'vitest'

import { buildAdminAiLatencySummary } from '@/lib/admin/ai-latency-summary'

describe('admin ai latency summary', () => {
    it('maps raw event rows into dashboard-ready metrics', () => {
        const summary = buildAdminAiLatencySummary({
            periodKey: '2026-03',
            isAllTime: false,
            rows: [
                {
                    organization_id: 'org-1',
                    metric_key: 'lead_extraction',
                    duration_ms: 3900
                },
                {
                    organization_id: 'org-1',
                    metric_key: 'lead_extraction',
                    duration_ms: 5100
                },
                {
                    organization_id: 'org-1',
                    metric_key: 'llm_response',
                    duration_ms: 2400
                },
                {
                    organization_id: 'org-1',
                    metric_key: 'llm_response',
                    duration_ms: 3000
                },
                {
                    organization_id: 'org-1',
                    metric_key: 'llm_response',
                    duration_ms: 3300
                }
            ]
        })

        expect(summary.periodKey).toBe('2026-03')
        expect(summary.isAllTime).toBe(false)
        expect(summary.leadExtraction).toEqual({
            sampleCount: 2,
            averageMs: 4500,
            p95Ms: 5100,
            maxMs: 5100
        })
        expect(summary.llmResponse).toEqual({
            sampleCount: 3,
            averageMs: 2900,
            p95Ms: 3300,
            maxMs: 3300
        })
    })

    it('ignores unsupported metric keys', () => {
        const summary = buildAdminAiLatencySummary({
            periodKey: 'all',
            isAllTime: true,
            rows: [
                {
                    organization_id: 'org-1',
                    metric_key: 'lead_extraction',
                    duration_ms: 4100
                },
                {
                    organization_id: 'org-1',
                    metric_key: 'unknown_metric',
                    duration_ms: 9999
                }
            ]
        })

        expect(summary.leadExtraction.sampleCount).toBe(1)
        expect(summary.llmResponse.sampleCount).toBe(0)
    })
})
