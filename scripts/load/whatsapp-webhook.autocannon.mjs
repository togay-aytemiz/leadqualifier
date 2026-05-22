import { createServer } from 'node:http'
import { once } from 'node:events'

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return parsed
}

async function startHarnessServer() {
    const server = createServer((req, res) => {
        if (req.method !== 'POST' || req.url !== '/api/webhooks/whatsapp') {
            res.writeHead(404, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'not-found' }))
            return
        }

        let rawBody = ''
        req.setEncoding('utf8')
        req.on('data', (chunk) => {
            rawBody += chunk
        })
        req.on('end', () => {
            try {
                const payload = JSON.parse(rawBody)
                const hasEntry = Array.isArray(payload?.entry) && payload.entry.length > 0
                if (!hasEntry) {
                    res.writeHead(400, { 'content-type': 'application/json' })
                    res.end(JSON.stringify({ error: 'invalid-entry' }))
                    return
                }

                res.writeHead(200, { 'content-type': 'application/json' })
                res.end(JSON.stringify({ ok: true }))
            } catch {
                res.writeHead(400, { 'content-type': 'application/json' })
                res.end(JSON.stringify({ error: 'invalid-json' }))
            }
        })
    })

    server.listen(0, '127.0.0.1')
    await once(server, 'listening')

    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('Failed to resolve harness server address')
    }

    return {
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
    }
}

async function run() {
    const connections = parsePositiveInteger(process.env.LOAD_CONNECTIONS, 20)
    const durationSeconds = parsePositiveInteger(process.env.LOAD_DURATION_SECONDS, 10)
    const explicitBaseUrl = process.env.LOAD_BASE_URL?.trim() || ''

    let harness = null
    let baseUrl = explicitBaseUrl

    if (!baseUrl) {
        harness = await startHarnessServer()
        baseUrl = harness.baseUrl
    }

    const payload = JSON.stringify({
        entry: [{
            changes: [{
                value: {
                    metadata: {
                        phone_number_id: 'phone-load'
                    },
                    contacts: [{
                        wa_id: '905551112233',
                        profile: { name: 'Load Test User' }
                    }],
                    messages: [{
                        from: '905551112233',
                        id: `wamid-load-${Date.now()}`,
                        timestamp: String(Math.floor(Date.now() / 1000)),
                        type: 'text',
                        text: {
                            body: 'load test'
                        }
                    }]
                }
            }]
        }]
    })

    const targetUrl = `${baseUrl.replace(/\/$/, '')}/api/webhooks/whatsapp`
    const startedAt = Date.now()
    const endAt = startedAt + (durationSeconds * 1000)
    let totalRequests = 0
    let success2xx = 0
    const latencies = []

    async function worker() {
        while (Date.now() < endAt) {
            const requestStartedAt = Date.now()
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-hub-signature-256': 'sha256=load-test'
                },
                body: payload
            })

            await response.arrayBuffer()
            const latency = Date.now() - requestStartedAt
            latencies.push(latency)
            totalRequests += 1
            if (response.status >= 200 && response.status < 300) {
                success2xx += 1
            }
        }
    }

    await Promise.all(Array.from({ length: connections }, () => worker()))

    if (harness?.server) {
        await new Promise((resolve) => harness.server.close(resolve))
    }

    latencies.sort((a, b) => a - b)
    const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000)
    const avgReqPerSec = totalRequests / elapsedSeconds
    const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1)
    const p95LatencyMs = latencies[p95Index] ?? 0
    const non2xx = totalRequests - success2xx
    const successRatio = totalRequests > 0 ? success2xx / totalRequests : 0

    console.log('[load-test] target:', targetUrl)
    console.log('[load-test] requests_total:', totalRequests)
    console.log('[load-test] req_per_sec_avg:', Number(avgReqPerSec).toFixed(2))
    console.log('[load-test] p95_latency_ms:', p95LatencyMs)
    console.log('[load-test] non_2xx:', non2xx)
    console.log('[load-test] success_ratio:', successRatio.toFixed(4))

    if (totalRequests === 0) {
        throw new Error('No requests were recorded during load run.')
    }

    if (successRatio < 0.99) {
        throw new Error(`2xx ratio below threshold: ${(successRatio * 100).toFixed(2)}% < 99%`)
    }
}

run().catch((error) => {
    console.error('[load-test] failed:', error instanceof Error ? error.message : error)
    process.exit(1)
})
