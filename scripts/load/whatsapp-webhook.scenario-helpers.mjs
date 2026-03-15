function percentile(values, rank) {
    if (!Array.isArray(values) || values.length === 0) return 0

    const sorted = [...values].sort((left, right) => left - right)
    const normalizedRank = Math.min(Math.max(rank, 0), 1)
    const index = Math.max(0, Math.ceil(normalizedRank * sorted.length) - 1)
    return sorted[index] ?? sorted[sorted.length - 1] ?? 0
}

export function buildWhatsAppTextPayload({
    phoneNumberId,
    contactPhone,
    contactName,
    messageId,
    messageBody,
    timestampSeconds
}) {
    return {
        entry: [{
            changes: [{
                value: {
                    metadata: {
                        phone_number_id: phoneNumberId
                    },
                    contacts: [{
                        wa_id: contactPhone,
                        profile: {
                            name: contactName
                        }
                    }],
                    messages: [{
                        from: contactPhone,
                        id: messageId,
                        timestamp: String(timestampSeconds),
                        type: 'text',
                        text: {
                            body: messageBody
                        }
                    }]
                }
            }]
        }]
    }
}

export function summarizeScenarioMetrics({ durationMs, results }) {
    const safeResults = Array.isArray(results) ? results : []
    const latencies = safeResults
        .map((result) => Number(result?.latencyMs))
        .filter((value) => Number.isFinite(value) && value >= 0)
    const totalRequests = safeResults.length
    const success2xx = safeResults.filter((result) => {
        const status = Number(result?.status)
        return Number.isFinite(status) && status >= 200 && status < 300
    }).length
    const non2xx = safeResults.filter((result) => {
        const status = Number(result?.status)
        if (!Number.isFinite(status)) return false
        if (result?.errorCode === 'timeout') return false
        return status < 200 || status >= 300
    }).length
    const timeouts = safeResults.filter((result) => result?.errorCode === 'timeout').length
    const transportErrors = safeResults.filter((result) => {
        return result?.errorCode && result.errorCode !== 'timeout'
    }).length
    const successRatio = totalRequests > 0 ? success2xx / totalRequests : 0
    const latencyTotal = latencies.reduce((sum, value) => sum + value, 0)
    const reqPerSec = durationMs > 0 ? totalRequests / (durationMs / 1000) : 0

    return {
        totalRequests,
        success2xx,
        non2xx,
        timeouts,
        transportErrors,
        successRatio,
        reqPerSec,
        latency: {
            avg: latencies.length > 0 ? latencyTotal / latencies.length : 0,
            p50: percentile(latencies, 0.5),
            p95: percentile(latencies, 0.95),
            p99: percentile(latencies, 0.99),
            max: latencies.length > 0 ? Math.max(...latencies) : 0
        }
    }
}

export function evaluateScenarioThresholds(summary, thresholds) {
    const failures = []
    const rawMinSuccessRatio = thresholds?.minSuccessRatio
    const rawMaxP95LatencyMs = thresholds?.maxP95LatencyMs
    const minSuccessRatio = rawMinSuccessRatio == null ? null : Number(rawMinSuccessRatio)
    const maxP95LatencyMs = rawMaxP95LatencyMs == null ? null : Number(rawMaxP95LatencyMs)
    const successRatio = Number(summary?.successRatio ?? 0)
    const p95Latency = Number(summary?.latency?.p95 ?? 0)

    if (minSuccessRatio != null && Number.isFinite(minSuccessRatio) && successRatio < minSuccessRatio) {
        failures.push(
            `2xx ratio below threshold: ${(successRatio * 100).toFixed(2)}% < ${(minSuccessRatio * 100).toFixed(2)}%`
        )
    }

    if (maxP95LatencyMs != null && Number.isFinite(maxP95LatencyMs) && p95Latency > maxP95LatencyMs) {
        failures.push(`p95 latency above threshold: ${p95Latency}ms > ${maxP95LatencyMs}ms`)
    }

    return failures
}
