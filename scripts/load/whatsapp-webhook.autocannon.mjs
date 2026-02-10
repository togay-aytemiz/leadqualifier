import { createServer } from 'node:http'
import { once } from 'node:events'
import autocannon from 'autocannon'

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return parsed
}

function sumStatusCounts(statusCodeStats = {}, isWanted) {
    return Object.entries(statusCodeStats).reduce((sum, [code, stat]) => {
        const numericCode = Number.parseInt(code, 10)
        if (!Number.isFinite(numericCode)) return sum
        if (!isWanted(numericCode)) return sum

        if (typeof stat === 'number') return sum + stat
        if (stat && typeof stat === 'object' && 'count' in stat) {
            const count = Number.parseInt(String(stat.count), 10)
            if (Number.isFinite(count)) return sum + count
        }

        return sum
    }, 0)
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

    const result = await new Promise((resolve, reject) => {
        autocannon({
            url: targetUrl,
            method: 'POST',
            connections,
            duration: durationSeconds,
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': 'sha256=load-test'
            },
            body: payload,
            pipelining: 1
        }, (error, summary) => {
            if (error) {
                reject(error)
                return
            }
            resolve(summary)
        })
    })

    if (harness?.server) {
        await new Promise((resolve) => harness.server.close(resolve))
    }

    const totalRequests = result?.requests?.total ?? 0
    const avgReqPerSec = result?.requests?.average ?? 0
    const p95LatencyMs = result?.latency?.p95 ?? 0
    const success2xx = sumStatusCounts(result?.statusCodeStats, (code) => code >= 200 && code < 300)
    const non2xx = sumStatusCounts(result?.statusCodeStats, (code) => code < 200 || code >= 300)
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
