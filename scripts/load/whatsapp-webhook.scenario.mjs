import { createHmac } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { performance } from 'node:perf_hooks'

import {
    buildWhatsAppTextPayload,
    evaluateScenarioThresholds,
    summarizeScenarioMetrics
} from './whatsapp-webhook.scenario-helpers.mjs'

const MESSAGE_SETS = [
    [
        'Merhaba, cilt bakimi fiyatlarinizi ogrenebilir miyim?',
        'Bu hafta icin musait saat var mi?',
        'Kadikoy tarafindayim.',
        'Butcem yaklasik 3000 TL.'
    ],
    [
        'Merhaba, newborn cekimi icin bilgi alabilir miyim?',
        'Nisan ayinin ikinci haftasi dusunuyorum.',
        'Studyo cekimi de yapiyor musunuz?',
        'Fiyat araliginiz nedir?'
    ],
    [
        'Merhaba, dis beyazlatma surecini ogrenebilir miyim?',
        'Aksam 6dan sonra gelebilirim.',
        'Islem kac seans suruyor?',
        'Bugun donus alabilir miyim?'
    ]
]

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return parsed
}

function parseNonNegativeInteger(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10)
    if (!Number.isFinite(parsed) || parsed < 0) return fallback
    return parsed
}

function parseOptionalPositiveInteger(value) {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) return null
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return parsed
}

function parseOptionalRatio(value) {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) return null
    const parsed = Number.parseFloat(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null
    return parsed
}

function sleep(ms) {
    if (ms <= 0) return Promise.resolve()
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildSignature(serializedPayload, appSecret) {
    if (!appSecret) return 'sha256=load-test'
    const digest = createHmac('sha256', appSecret).update(serializedPayload).digest('hex')
    return `sha256=${digest}`
}

function buildContactPhone(prefix, userIndex) {
    return `${prefix}${String(userIndex + 1).padStart(4, '0')}`
}

function buildMessageBody(userIndex, messageIndex) {
    const messageSet = MESSAGE_SETS[userIndex % MESSAGE_SETS.length] ?? MESSAGE_SETS[0]
    return messageSet[messageIndex % messageSet.length] ?? 'Merhaba'
}

function randomSuffix() {
    return Math.random().toString(36).slice(2, 10)
}

async function startHarnessServer() {
    const responseDelayMs = parseNonNegativeInteger(process.env.LOAD_HARNESS_DELAY_MS, 0)

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
        req.on('end', async () => {
            try {
                const payload = JSON.parse(rawBody)
                const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
                if (!message?.id || !message?.text?.body) {
                    res.writeHead(400, { 'content-type': 'application/json' })
                    res.end(JSON.stringify({ error: 'invalid-message' }))
                    return
                }

                if (responseDelayMs > 0) {
                    await sleep(responseDelayMs)
                }

                res.writeHead(200, { 'content-type': 'application/json' })
                res.end(JSON.stringify({ ok: true, messageId: message.id }))
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

async function sendOneMessage({
    appSecret,
    contactName,
    contactPhone,
    messageBody,
    messageId,
    phoneNumberId,
    targetUrl,
    timeoutMs
}) {
    const payload = buildWhatsAppTextPayload({
        phoneNumberId,
        contactPhone,
        contactName,
        messageId,
        messageBody,
        timestampSeconds: Math.floor(Date.now() / 1000)
    })
    const serializedPayload = JSON.stringify(payload)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    const startedAt = performance.now()

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': buildSignature(serializedPayload, appSecret)
            },
            body: serializedPayload,
            signal: controller.signal
        })

        return {
            ok: response.ok,
            status: response.status,
            latencyMs: Math.round(performance.now() - startedAt),
            errorCode: null
        }
    } catch (error) {
        const isTimeout = error instanceof Error && error.name === 'AbortError'
        return {
            ok: false,
            status: null,
            latencyMs: Math.round(performance.now() - startedAt),
            errorCode: isTimeout ? 'timeout' : 'transport_error',
            errorMessage: error instanceof Error ? error.message : String(error)
        }
    } finally {
        clearTimeout(timeoutId)
    }
}

async function runVirtualUser({
    appSecret,
    contactNamePrefix,
    contactPrefix,
    messagesPerUser,
    phoneNumberId,
    results,
    targetUrl,
    thinkTimeMs,
    timeoutMs,
    userIndex,
    userStaggerMs,
    usersWithErrors
}) {
    const contactPhone = buildContactPhone(contactPrefix, userIndex)
    const contactName = `${contactNamePrefix} ${userIndex + 1}`
    let userHasErrors = false

    await sleep(userIndex * userStaggerMs)

    for (let messageIndex = 0; messageIndex < messagesPerUser; messageIndex += 1) {
        const messageId = `wamid-load-${Date.now()}-${userIndex + 1}-${messageIndex + 1}-${randomSuffix()}`
        const messageBody = buildMessageBody(userIndex, messageIndex)
        const result = await sendOneMessage({
            appSecret,
            contactName,
            contactPhone,
            messageBody,
            messageId,
            phoneNumberId,
            targetUrl,
            timeoutMs
        })

        results.push({
            ...result,
            userIndex,
            messageIndex
        })

        if (!result.ok) {
            userHasErrors = true
        }

        if (messageIndex < messagesPerUser - 1) {
            await sleep(thinkTimeMs)
        }
    }

    if (userHasErrors) {
        usersWithErrors.count += 1
    }
}

async function run() {
    const virtualUsers = parsePositiveInteger(process.env.LOAD_VIRTUAL_USERS, 8)
    const messagesPerUser = parsePositiveInteger(process.env.LOAD_MESSAGES_PER_USER, 4)
    const userStaggerMs = parseNonNegativeInteger(process.env.LOAD_USER_STAGGER_MS, 150)
    const thinkTimeMs = parseNonNegativeInteger(process.env.LOAD_THINK_TIME_MS, 250)
    const timeoutMs = parsePositiveInteger(process.env.LOAD_TIMEOUT_MS, 15000)
    const minSuccessRatio = parseOptionalRatio(process.env.LOAD_MIN_SUCCESS_RATIO) ?? 0.99
    const maxP95LatencyMs = parseOptionalPositiveInteger(process.env.LOAD_MAX_P95_MS)
    const explicitBaseUrl = process.env.LOAD_BASE_URL?.trim() || ''
    const appSecret = process.env.LOAD_APP_SECRET?.trim() || ''
    const phoneNumberId = process.env.LOAD_PHONE_NUMBER_ID?.trim() || 'phone-load'
    const contactPrefix = process.env.LOAD_CONTACT_PREFIX?.trim() || '90555000'
    const contactNamePrefix = process.env.LOAD_CONTACT_NAME_PREFIX?.trim() || 'Stress User'

    let harness = null
    let baseUrl = explicitBaseUrl

    if (!baseUrl) {
        harness = await startHarnessServer()
        baseUrl = harness.baseUrl
    }

    const targetUrl = `${baseUrl.replace(/\/$/, '')}/api/webhooks/whatsapp`
    const results = []
    const usersWithErrors = { count: 0 }
    const startedAt = performance.now()

    await Promise.all(
        Array.from({ length: virtualUsers }, (_, userIndex) => runVirtualUser({
            appSecret,
            contactNamePrefix,
            contactPrefix,
            messagesPerUser,
            phoneNumberId,
            results,
            targetUrl,
            thinkTimeMs,
            timeoutMs,
            userIndex,
            userStaggerMs,
            usersWithErrors
        }))
    )

    const durationMs = Math.round(performance.now() - startedAt)
    const summary = summarizeScenarioMetrics({ durationMs, results })

    if (harness?.server) {
        await new Promise((resolve) => harness.server.close(resolve))
    }

    const failures = []
    if (summary.totalRequests === 0) {
        failures.push('No requests were recorded during the scenario run.')
    }
    failures.push(...evaluateScenarioThresholds(summary, {
        minSuccessRatio,
        maxP95LatencyMs
    }))

    console.log('[scenario-load] target:', targetUrl)
    console.log('[scenario-load] virtual_users:', virtualUsers)
    console.log('[scenario-load] messages_per_user:', messagesPerUser)
    console.log('[scenario-load] duration_ms:', durationMs)
    console.log('[scenario-load] total_requests:', summary.totalRequests)
    console.log('[scenario-load] success_2xx:', summary.success2xx)
    console.log('[scenario-load] non_2xx:', summary.non2xx)
    console.log('[scenario-load] timeouts:', summary.timeouts)
    console.log('[scenario-load] transport_errors:', summary.transportErrors)
    console.log('[scenario-load] users_with_errors:', usersWithErrors.count)
    console.log('[scenario-load] success_ratio:', summary.successRatio.toFixed(4))
    console.log('[scenario-load] req_per_sec:', summary.reqPerSec.toFixed(2))
    console.log('[scenario-load] latency_avg_ms:', summary.latency.avg.toFixed(2))
    console.log('[scenario-load] latency_p50_ms:', summary.latency.p50)
    console.log('[scenario-load] latency_p95_ms:', summary.latency.p95)
    console.log('[scenario-load] latency_p99_ms:', summary.latency.p99)
    console.log('[scenario-load] latency_max_ms:', summary.latency.max)

    if (failures.length > 0) {
        for (const failure of failures) {
            console.error('[scenario-load] failed:', failure)
        }
        process.exit(1)
    }
}

run().catch((error) => {
    console.error('[scenario-load] failed:', error instanceof Error ? error.message : error)
    process.exit(1)
})
