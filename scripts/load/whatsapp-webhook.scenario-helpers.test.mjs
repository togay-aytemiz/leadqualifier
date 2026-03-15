import { describe, expect, it } from 'vitest'

import {
    buildWhatsAppTextPayload,
    evaluateScenarioThresholds,
    summarizeScenarioMetrics
} from './whatsapp-webhook.scenario-helpers.mjs'

describe('whatsapp stress scenario helpers', () => {
    it('builds a text webhook payload for a specific contact and message', () => {
        const payload = buildWhatsAppTextPayload({
            phoneNumberId: 'phone-load',
            contactPhone: '905551112233',
            contactName: 'Stress User 1',
            messageId: 'wamid-load-1',
            messageBody: 'Merhaba, fiyat alabilir miyim?',
            timestampSeconds: 1738000000
        })

        expect(payload).toEqual({
            entry: [{
                changes: [{
                    value: {
                        metadata: {
                            phone_number_id: 'phone-load'
                        },
                        contacts: [{
                            wa_id: '905551112233',
                            profile: { name: 'Stress User 1' }
                        }],
                        messages: [{
                            from: '905551112233',
                            id: 'wamid-load-1',
                            timestamp: '1738000000',
                            type: 'text',
                            text: {
                                body: 'Merhaba, fiyat alabilir miyim?'
                            }
                        }]
                    }
                }]
            }]
        })
    })

    it('summarizes latency, success ratio, and timeout counts', () => {
        const summary = summarizeScenarioMetrics({
            durationMs: 2000,
            results: [
                { ok: true, status: 200, latencyMs: 90 },
                { ok: true, status: 200, latencyMs: 120 },
                { ok: true, status: 202, latencyMs: 180 },
                { ok: false, status: 500, latencyMs: 240, errorCode: null },
                { ok: false, status: null, latencyMs: 300, errorCode: 'timeout' }
            ]
        })

        expect(summary.totalRequests).toBe(5)
        expect(summary.success2xx).toBe(3)
        expect(summary.non2xx).toBe(1)
        expect(summary.timeouts).toBe(1)
        expect(summary.successRatio).toBeCloseTo(0.6, 5)
        expect(summary.reqPerSec).toBeCloseTo(2.5, 5)
        expect(summary.latency.p50).toBe(180)
        expect(summary.latency.p95).toBe(300)
        expect(summary.latency.p99).toBe(300)
        expect(summary.latency.max).toBe(300)
    })

    it('flags threshold failures for success ratio and p95 latency', () => {
        const failures = evaluateScenarioThresholds({
            successRatio: 0.91,
            latency: {
                p95: 1900
            }
        }, {
            minSuccessRatio: 0.99,
            maxP95LatencyMs: 1200
        })

        expect(failures).toEqual([
            '2xx ratio below threshold: 91.00% < 99.00%',
            'p95 latency above threshold: 1900ms > 1200ms'
        ])
    })

    it('ignores optional p95 threshold when it is not provided', () => {
        const failures = evaluateScenarioThresholds({
            successRatio: 1,
            latency: {
                p95: 1900
            }
        }, {
            minSuccessRatio: 0.99,
            maxP95LatencyMs: null
        })

        expect(failures).toEqual([])
    })
})
