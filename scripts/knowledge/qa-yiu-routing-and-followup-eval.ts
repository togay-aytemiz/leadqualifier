import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createDemoChatAccessToken } from '@/lib/demo-chat/access'
import { buildDemoChatContactId, resolveDemoChatChannel } from '@/lib/demo-chat/channel'
import {
    DEMO_MAINTENANCE_BYPASS_COOKIE,
    createDemoMaintenanceBypassCookieValue
} from '@/lib/demo-chat/maintenance'
import { parseCustomerEvaluationRows } from '@/lib/knowledge-base/rag-eval/customer-question-score-report'

type Args = {
    mode: 'routing' | 'followup' | 'both'
    routingCount: number
    followupCount: number
    seed: string
    baseUrl: string
    slug: string
    questionDoc: string
    outDir: string
    docsDir: string
    dryRun: boolean
}

type QuestionRow = {
    no: number
    question: string
    originalScore: number
}

type DemoChannel = NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>

type BotMessageRow = {
    id?: string | null
    content?: string | null
    metadata?: Record<string, unknown> | null
}

type KnowledgeDocumentRow = {
    id: string
    title: string | null
    type: string | null
    content: string | null
}

type DemoTrace = {
    conversationId: string | null
    botMessageId: string | null
    metadata: Record<string, unknown> | null
    route: RouteKind
    sourceDocumentIds: string[]
    sourceTitles: string[]
    sourceUrls: string[]
    matchedSkillTitle: string | null
    matchedSkillId: string | null
    ragFailureReason: string | null
}

type RouteKind =
    | 'skill_answered'
    | 'rag_answered'
    | 'rag_no_info'
    | 'fallback_answered'
    | 'scope_help'
    | 'no_info_unknown_route'
    | 'unknown_answered'
    | 'error'

type AskResult = {
    answer: string
    httpStatuses: number[]
    messageId: string | null
}

type RoutingResult = {
    index: number
    poolId: number
    question: string
    previousScore: number
    answer: string
    sessionId: string
    messageId: string | null
    durationMs: number
    httpStatuses: number[]
    trace: DemoTrace
    error: string | null
}

type FollowupResult = {
    index: number
    poolId: number
    question: string
    acceptance: string
    sessionId: string
    first: {
        answer: string
        messageId: string | null
        durationMs: number
        httpStatuses: number[]
        trace: DemoTrace
        error: string | null
    }
    second: {
        answer: string
        messageId: string | null
        durationMs: number
        httpStatuses: number[]
        trace: DemoTrace
        error: string | null
    } | null
    status:
        | 'followup_skill_answered'
        | 'followup_rag_answered'
        | 'followup_fallback'
        | 'first_not_skill'
        | 'error'
}

type SupabaseQueryError = {
    message: string
}

type SupabaseQueryResult = {
    data: unknown
    error: SupabaseQueryError | null
}

type SupabaseQuery = PromiseLike<SupabaseQueryResult> & {
    eq: (column: string, value: unknown) => SupabaseQuery
    maybeSingle: () => PromiseLike<SupabaseQueryResult>
    order: (column: string, options: { ascending: boolean }) => SupabaseQuery
    limit: (count: number) => SupabaseQuery
    in: (column: string, values: readonly string[]) => SupabaseQuery
}

type SupabaseTableBuilder = {
    select: (columns: string) => SupabaseQuery
}

type SupabaseClientLike = {
    from: (table: string) => SupabaseTableBuilder
}

const DEFAULT_BASE_URL = 'http://localhost:3000'
const DEFAULT_SLUG = 'yiu-tanitim-gunleri-2026'
const DEFAULT_QUESTION_DOC = 'docs/evaluations/yiu-demo-customer-questions-2026-06-05.md'
const DEFAULT_OUT_DIR = 'tmp/crawl-output'
const DEFAULT_DOCS_DIR = 'docs/evaluations'
const DEFAULT_FETCH_TIMEOUT_MS = 45000
const POLL_INTERVAL_MS = 1250
const POLL_ATTEMPTS = 60
const ACCEPTANCE_MESSAGES = [
    'olur',
    'evet, lütfen devam et',
    'tamam, bunu da göster',
    'evet, onu da merak ediyorum',
    'olur, detayını anlat'
]

function parseArgs(argv: string[]): Args {
    const args: Args = {
        mode: 'both',
        routingCount: 100,
        followupCount: 50,
        seed: 'yiu-routing-followup-2026-06-13',
        baseUrl: process.env.PUBLIC_DEMO_BASE_URL?.trim() || DEFAULT_BASE_URL,
        slug: process.env.PUBLIC_DEMO_SLUG?.trim() || DEFAULT_SLUG,
        questionDoc: DEFAULT_QUESTION_DOC,
        outDir: DEFAULT_OUT_DIR,
        docsDir: DEFAULT_DOCS_DIR,
        dryRun: false
    }

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index] ?? ''
        if (!token.startsWith('--')) continue
        const key = token.slice(2)
        if (key === 'dry-run') {
            args.dryRun = true
            continue
        }

        const value = argv[index + 1]
        if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
        index += 1

        if (key === 'mode') {
            if (!['routing', 'followup', 'both'].includes(value)) throw new Error(`Invalid --mode ${value}`)
            args.mode = value as Args['mode']
        } else if (key === 'routing-count') {
            args.routingCount = Number(value)
        } else if (key === 'followup-count') {
            args.followupCount = Number(value)
        } else if (key === 'seed') {
            args.seed = value
        } else if (key === 'base-url') {
            args.baseUrl = value
        } else if (key === 'slug') {
            args.slug = value
        } else if (key === 'question-doc') {
            args.questionDoc = value
        } else if (key === 'out-dir') {
            args.outDir = value
        } else if (key === 'docs-dir') {
            args.docsDir = value
        } else {
            throw new Error(`Unknown argument --${key}`)
        }
    }

    if (!Number.isInteger(args.routingCount) || args.routingCount < 1) {
        throw new Error('--routing-count must be a positive integer')
    }
    if (!Number.isInteger(args.followupCount) || args.followupCount < 1) {
        throw new Error('--followup-count must be a positive integer')
    }

    return args
}

function parseEnvValue(value: string) {
    const trimmed = value.trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

async function loadEnvFile(filePath: string, protectedKeys: Set<string>) {
    try {
        const content = await readFile(filePath, 'utf8')
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const equalsIndex = trimmed.indexOf('=')
            if (equalsIndex === -1) continue
            const key = trimmed.slice(0, equalsIndex).trim()
            if (!key || protectedKeys.has(key)) continue
            process.env[key] = parseEnvValue(trimmed.slice(equalsIndex + 1))
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
}

async function loadProjectEnv() {
    const protectedKeys = new Set(Object.keys(process.env))
    const cwd = process.cwd()
    await loadEnvFile(path.join(cwd, '.env'), protectedKeys)
    await loadEnvFile(path.join(cwd, '.env.local'), protectedKeys)
    await loadEnvFile(path.join(cwd, '.env.development.local'), protectedKeys)
}

function requireEnv(name: string) {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`${name} is required`)
    return value
}

function seededRandom(seed: string) {
    let hash = 1779033703 ^ seed.length
    for (let index = 0; index < seed.length; index += 1) {
        hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353)
        hash = (hash << 13) | (hash >>> 19)
    }

    return () => {
        hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
        hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
        const value = (hash ^= hash >>> 16) >>> 0
        return value / 4294967296
    }
}

function sampleRows(rows: QuestionRow[], count: number, seed: string) {
    const random = seededRandom(seed)
    const shuffled = [...rows]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1))
        const current = shuffled[index]!
        shuffled[index] = shuffled[target]!
        shuffled[target] = current
    }
    return shuffled.slice(0, Math.min(count, shuffled.length))
}

function readReplyPayload(data: unknown) {
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    return {
        pending: payload.pending === true,
        messageId: typeof payload.messageId === 'string' ? payload.messageId : '',
        response: typeof payload.response === 'string' ? payload.response.trim() : ''
    }
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(url, {
            ...init,
            signal: controller.signal
        })
        let data: unknown = null
        try {
            data = await response.json()
        } catch {
            data = null
        }
        return { response, data }
    } finally {
        clearTimeout(timeout)
    }
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function askDemo(input: {
    baseUrl: string
    slug: string
    token: string
    sessionId: string
    message: string
    fetchTimeoutMs?: number
}): Promise<AskResult> {
    const httpStatuses: number[] = []
    const endpoint = `${input.baseUrl.replace(/\/$/, '')}/api/demo/${encodeURIComponent(input.slug)}/chat`
    const bypassCookieValue = createDemoMaintenanceBypassCookieValue()
    const cookieHeader = bypassCookieValue
        ? `${DEMO_MAINTENANCE_BYPASS_COOKIE}=${bypassCookieValue}`
        : ''
    const initial = await fetchJson(endpoint, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${input.token}`,
            'content-type': 'application/json',
            ...(cookieHeader ? { cookie: cookieHeader } : {})
        },
        body: JSON.stringify({
            sessionId: input.sessionId,
            message: input.message
        })
    }, input.fetchTimeoutMs)
    httpStatuses.push(initial.response.status)
    const initialPayload = readReplyPayload(initial.data)
    if (initial.response.status !== 202) {
        if (!initial.response.ok) throw new Error(`POST ${initial.response.status}: ${JSON.stringify(initial.data)}`)
        return { answer: initialPayload.response, httpStatuses, messageId: initialPayload.messageId || null }
    }

    if (!initialPayload.pending || !initialPayload.messageId) {
        throw new Error(`POST 202 missing pending message id: ${JSON.stringify(initial.data)}`)
    }

    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        await sleep(POLL_INTERVAL_MS)
        const pollUrl = new URL(endpoint)
        pollUrl.searchParams.set('sessionId', input.sessionId)
        pollUrl.searchParams.set('messageId', initialPayload.messageId)
        pollUrl.searchParams.set('message', input.message)
        const poll = await fetchJson(pollUrl.toString(), {
            headers: {
                authorization: `Bearer ${input.token}`,
                ...(cookieHeader ? { cookie: cookieHeader } : {})
            }
        }, input.fetchTimeoutMs)
        httpStatuses.push(poll.response.status)
        const pollPayload = readReplyPayload(poll.data)
        if (poll.response.status === 202 && pollPayload.pending) continue
        if (!poll.response.ok) throw new Error(`GET ${poll.response.status}: ${JSON.stringify(poll.data)}`)
        return { answer: pollPayload.response, httpStatuses, messageId: initialPayload.messageId || null }
    }

    throw new Error('Polling timed out')
}

function readMetadataArray(metadata: Record<string, unknown> | null, key: string) {
    const value = metadata?.[key]
    return Array.isArray(value) ? value : []
}

function readMetadataString(metadata: Record<string, unknown> | null, key: string) {
    const value = metadata?.[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readMetadataRecord(metadata: Record<string, unknown> | null, key: string) {
    const value = metadata?.[key]
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function extractSourceUrl(content: string | null | undefined) {
    return content?.match(/^Source URL:\s*(.+)$/im)?.[1]?.trim() ?? ''
}

function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
}

function readSourceIdsFromMetadata(metadata: Record<string, unknown> | null | undefined) {
    return uniqueStrings(
        readMetadataArray(metadata ?? null, 'sources')
            .filter((source): source is string => typeof source === 'string')
    )
}

function readCitationSourcesFromMetadata(metadata: Record<string, unknown> | null | undefined) {
    const sources = readMetadataArray(metadata ?? null, 'sources')
    const titles: string[] = []
    const urls: string[] = []

    for (const source of sources) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) continue
        const record = source as Record<string, unknown>
        if (typeof record.title === 'string') titles.push(record.title)
        if (typeof record.url === 'string') urls.push(record.url)
    }

    return { titles: uniqueStrings(titles), urls: uniqueStrings(urls) }
}

function isNoInfoAnswer(answer: string) {
    return /onayl[ıi]\s+kaynaklarda\s+ula[şs]amad[ıi]m|bilgi\s+kayna[ğg][ıi]na\s+eri[şs]emiyorum|net\s+bilgi\s+yok|no[_\s-]?answer/i.test(answer)
}

function classifyRoute(answer: string, metadata: Record<string, unknown> | null): RouteKind {
    if (!metadata) return isNoInfoAnswer(answer) ? 'no_info_unknown_route' : 'unknown_answered'

    if (metadata.skill_id || metadata.matched_skill_title) return 'skill_answered'
    if (metadata.demo_chat_reply_source === 'scope_help') return 'scope_help'
    if (metadata.is_fallback === true) return isNoInfoAnswer(answer) ? 'rag_no_info' : 'fallback_answered'

    const ragFileSearch = readMetadataRecord(metadata, 'rag_file_search')
    if (metadata.is_rag === true || ragFileSearch || metadata.demo_chat_reply_source === 'simple_standalone_query_rag') {
        const failureReason = readMetadataString(ragFileSearch, 'failure_reason')
        if (failureReason || isNoInfoAnswer(answer)) return 'rag_no_info'
        return 'rag_answered'
    }

    return isNoInfoAnswer(answer) ? 'no_info_unknown_route' : 'unknown_answered'
}

async function loadDemoTrace(input: {
    supabase: SupabaseClientLike
    channel: DemoChannel
    sessionId: string
    messageId: string | null
    answer: string
}): Promise<DemoTrace> {
    const contactId = buildDemoChatContactId(input.channel.id, input.sessionId)
    const { data: conversation, error: conversationError } = await input.supabase
        .from('conversations')
        .select('id')
        .eq('organization_id', input.channel.organizationId)
        .eq('platform', 'demo_chat')
        .eq('contact_phone', contactId)
        .maybeSingle()

    if (conversationError) throw conversationError
    const conversationRow = conversation as { id?: unknown } | null
    const conversationId = typeof conversationRow?.id === 'string' ? conversationRow.id : null
    if (!conversationId) {
        return emptyTrace(null, input.answer)
    }

    let messagesQuery = input.supabase
        .from('messages')
        .select('id, content, metadata')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'bot')
        .order('created_at', { ascending: false })
        .limit(10)

    if (input.messageId) {
        messagesQuery = messagesQuery.eq('metadata->>demo_chat_reply_to_message_id', input.messageId)
    }

    const { data: messages, error: messagesError } = await messagesQuery
    if (messagesError) throw messagesError

    const rows = (messages ?? []) as BotMessageRow[]
    const botMessage = rows.find((message) => typeof message.content === 'string' && message.content.trim())
        ?? rows[0]
        ?? null
    const metadata = botMessage?.metadata ?? null
    const sourceDocumentIds = readSourceIdsFromMetadata(metadata)
    const citationSources = readCitationSourcesFromMetadata(metadata)
    const sourceTitlesFromMetadata = readMetadataArray(metadata, 'source_titles')
        .filter((value): value is string => typeof value === 'string')
    const sourceUrlsFromMetadata = readMetadataArray(metadata, 'source_urls')
        .filter((value): value is string => typeof value === 'string')

    let documentRows: KnowledgeDocumentRow[] = []
    if (sourceDocumentIds.length > 0) {
        const { data: documents, error: documentsError } = await input.supabase
            .from('knowledge_documents')
            .select('id, title, type, content')
            .in('id', sourceDocumentIds)

        if (documentsError) throw documentsError
        documentRows = (documents ?? []) as KnowledgeDocumentRow[]
    }

    const ragFileSearch = readMetadataRecord(metadata, 'rag_file_search')
    return {
        conversationId,
        botMessageId: botMessage?.id ?? null,
        metadata,
        route: classifyRoute(input.answer, metadata),
        sourceDocumentIds,
        sourceTitles: uniqueStrings([
            ...sourceTitlesFromMetadata,
            ...citationSources.titles,
            ...documentRows.map((document) => document.title || 'Untitled')
        ]),
        sourceUrls: uniqueStrings([
            ...sourceUrlsFromMetadata,
            ...citationSources.urls,
            ...documentRows.map((document) => extractSourceUrl(document.content))
        ]),
        matchedSkillTitle: readMetadataString(metadata, 'matched_skill_title') ?? readMetadataString(metadata, 'skill_title'),
        matchedSkillId: readMetadataString(metadata, 'skill_id'),
        ragFailureReason: readMetadataString(ragFileSearch, 'failure_reason')
    }
}

function emptyTrace(conversationId: string | null, answer: string): DemoTrace {
    return {
        conversationId,
        botMessageId: null,
        metadata: null,
        route: classifyRoute(answer, null),
        sourceDocumentIds: [],
        sourceTitles: [],
        sourceUrls: [],
        matchedSkillTitle: null,
        matchedSkillId: null,
        ragFailureReason: null
    }
}

function routeCounts(results: Array<{ trace: DemoTrace }>) {
    const counts = new Map<RouteKind, number>()
    for (const result of results) {
        counts.set(result.trace.route, (counts.get(result.trace.route) ?? 0) + 1)
    }
    return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right))) as Record<RouteKind, number>
}

function millisToSeconds(value: number) {
    return `${(value / 1000).toFixed(1)}s`
}

function percentile(values: number[], p: number) {
    if (values.length === 0) return 0
    const sorted = [...values].sort((left, right) => left - right)
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
    return sorted[index] ?? 0
}

function markdownCell(value: string | number | null | undefined) {
    return String(value ?? '')
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, '<br>')
}

function summarizeRouting(results: RoutingResult[]) {
    const completed = results.filter((result) => !result.error)
    const latencies = completed.map((result) => result.durationMs)
    return {
        completed: completed.length,
        errors: results.length - completed.length,
        routeCounts: routeCounts(results.filter((result) => !result.error)),
        averageLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0,
        p50LatencyMs: percentile(latencies, 50),
        p90LatencyMs: percentile(latencies, 90)
    }
}

function summarizeFollowups(results: FollowupResult[]) {
    const statusCounts = new Map<FollowupResult['status'], number>()
    for (const result of results) {
        statusCounts.set(result.status, (statusCounts.get(result.status) ?? 0) + 1)
    }
    return Object.fromEntries([...statusCounts.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function renderRoutingMarkdown(input: {
    runId: string
    baseUrl: string
    slug: string
    seed: string
    selected: QuestionRow[]
    results: RoutingResult[]
}) {
    const summary = summarizeRouting(input.results)
    const lines = [
        '# YİÜ Random 100 Routing Eval',
        '',
        `Run: ${input.runId}`,
        `Base URL: ${input.baseUrl}`,
        `Demo slug: ${input.slug}`,
        `Seed: ${input.seed}`,
        `Question pool: 508`,
        `Selected: ${input.selected.length}`,
        `Completed: ${summary.completed}`,
        `Errors: ${summary.errors}`,
        `Average latency: ${millisToSeconds(summary.averageLatencyMs)}`,
        `p50 latency: ${millisToSeconds(summary.p50LatencyMs)}`,
        `p90 latency: ${millisToSeconds(summary.p90LatencyMs)}`,
        '',
        '## Route Counts',
        '',
        '| Route | Count |',
        '|---|---:|',
        ...Object.entries(summary.routeCounts).map(([route, count]) => `| ${route} | ${count} |`),
        '',
        '## Raw Results',
        '',
        '| # | Pool ID | Question | Route | Skill | Sources | Answer | Previous score | Latency | HTTP | Error |',
        '|---:|---:|---|---|---|---|---|---:|---:|---|---|',
        ...input.results.map((result) => `| ${result.index} | ${result.poolId} | ${markdownCell(result.question)} | ${result.trace.route} | ${markdownCell(result.trace.matchedSkillTitle ?? '-')} | ${markdownCell(result.trace.sourceTitles.join('; ') || result.trace.sourceUrls.join('; ') || '-')} | ${markdownCell(result.answer)} | ${result.previousScore} | ${millisToSeconds(result.durationMs)} | ${result.httpStatuses.join('→') || '-'} | ${markdownCell(result.error ?? '')} |`),
        ''
    ]
    return `${lines.join('\n')}\n`
}

function renderFollowupMarkdown(input: {
    runId: string
    baseUrl: string
    slug: string
    seed: string
    selected: QuestionRow[]
    results: FollowupResult[]
}) {
    const statusCounts = summarizeFollowups(input.results)
    const lines = [
        '# YİÜ Random 50 Skill Follow-up Eval',
        '',
        `Run: ${input.runId}`,
        `Base URL: ${input.baseUrl}`,
        `Demo slug: ${input.slug}`,
        `Seed: ${input.seed}`,
        `Question pool: 508`,
        `Selected: ${input.selected.length}`,
        '',
        '## Status Counts',
        '',
        '| Status | Count |',
        '|---|---:|',
        ...Object.entries(statusCounts).map(([status, count]) => `| ${status} | ${count} |`),
        '',
        '## Raw Results',
        '',
        '| # | Pool ID | Question | First route | First skill | Acceptance | Second route | Second skill | Status | First answer | Second answer | Error |',
        '|---:|---:|---|---|---|---|---|---|---|---|---|---|',
        ...input.results.map((result) => `| ${result.index} | ${result.poolId} | ${markdownCell(result.question)} | ${result.first.trace.route} | ${markdownCell(result.first.trace.matchedSkillTitle ?? '-')} | ${markdownCell(result.acceptance)} | ${result.second?.trace.route ?? '-'} | ${markdownCell(result.second?.trace.matchedSkillTitle ?? '-')} | ${result.status} | ${markdownCell(result.first.answer)} | ${markdownCell(result.second?.answer ?? '')} | ${markdownCell(result.first.error ?? result.second?.error ?? '')} |`),
        ''
    ]
    return `${lines.join('\n')}\n`
}

async function askAndTrace(input: {
    supabase: SupabaseClientLike
    channel: DemoChannel
    baseUrl: string
    slug: string
    token: string
    sessionId: string
    message: string
}) {
    const startedAt = Date.now()
    const reply = await askDemo({
        baseUrl: input.baseUrl,
        slug: input.slug,
        token: input.token,
        sessionId: input.sessionId,
        message: input.message
    })
    const trace = await loadDemoTrace({
        supabase: input.supabase,
        channel: input.channel,
        sessionId: input.sessionId,
        messageId: reply.messageId,
        answer: reply.answer
    })
    return {
        answer: reply.answer,
        messageId: reply.messageId,
        httpStatuses: reply.httpStatuses,
        durationMs: Date.now() - startedAt,
        trace,
        error: null
    }
}

async function runRoutingEval(input: {
    rows: QuestionRow[]
    supabase: SupabaseClientLike
    channel: DemoChannel
    token: string
    args: Args
    runId: string
}) {
    const selected = sampleRows(input.rows, input.args.routingCount, `${input.args.seed}:routing`)
    const results: RoutingResult[] = []

    for (let index = 0; index < selected.length; index += 1) {
        const row = selected[index]!
        const sessionId = `codex-yiu-routing-${input.runId}-${index + 1}`
        console.log(`ROUTING ${index + 1}/${selected.length} #${row.no}: ${row.question}`)
        try {
            const turn = await askAndTrace({
                supabase: input.supabase,
                channel: input.channel,
                baseUrl: input.args.baseUrl,
                slug: input.args.slug,
                token: input.token,
                sessionId,
                message: row.question
            })
            results.push({
                index: index + 1,
                poolId: row.no,
                question: row.question,
                previousScore: row.originalScore,
                sessionId,
                messageId: turn.messageId,
                answer: turn.answer,
                durationMs: turn.durationMs,
                httpStatuses: turn.httpStatuses,
                trace: turn.trace,
                error: null
            })
            console.log(`  -> ${turn.trace.route}${turn.trace.matchedSkillTitle ? ` (${turn.trace.matchedSkillTitle})` : ''}`)
        } catch (error) {
            const failure = error instanceof Error ? error.message : String(error)
            results.push({
                index: index + 1,
                poolId: row.no,
                question: row.question,
                previousScore: row.originalScore,
                sessionId,
                messageId: null,
                answer: '',
                durationMs: 0,
                httpStatuses: [],
                trace: emptyTrace(null, ''),
                error: failure
            })
            console.log(`  -> ERROR ${failure}`)
        }
    }

    return { selected, results }
}

function followupStatus(first: DemoTrace, second: DemoTrace | null, secondError: string | null): FollowupResult['status'] {
    if (secondError) return 'error'
    if (first.route !== 'skill_answered') return 'first_not_skill'
    if (!second) return 'error'
    if (second.route === 'skill_answered') return 'followup_skill_answered'
    if (second.route === 'rag_answered' || second.route === 'rag_no_info') return 'followup_rag_answered'
    if (second.route === 'fallback_answered' || second.route === 'scope_help' || second.route === 'no_info_unknown_route') {
        return 'followup_fallback'
    }
    return 'error'
}

async function runFollowupEval(input: {
    rows: QuestionRow[]
    supabase: SupabaseClientLike
    channel: DemoChannel
    token: string
    args: Args
    runId: string
}) {
    const selected = sampleRows(input.rows, input.args.followupCount, `${input.args.seed}:followup`)
    const results: FollowupResult[] = []

    for (let index = 0; index < selected.length; index += 1) {
        const row = selected[index]!
        const acceptance = ACCEPTANCE_MESSAGES[index % ACCEPTANCE_MESSAGES.length]!
        const sessionId = `codex-yiu-followup-${input.runId}-${index + 1}`
        console.log(`FOLLOWUP ${index + 1}/${selected.length} #${row.no}: ${row.question}`)
        let first: FollowupResult['first']
        try {
            first = await askAndTrace({
                supabase: input.supabase,
                channel: input.channel,
                baseUrl: input.args.baseUrl,
                slug: input.args.slug,
                token: input.token,
                sessionId,
                message: row.question
            })
        } catch (error) {
            first = {
                answer: '',
                messageId: null,
                durationMs: 0,
                httpStatuses: [],
                trace: emptyTrace(null, ''),
                error: error instanceof Error ? error.message : String(error)
            }
            results.push({
                index: index + 1,
                poolId: row.no,
                question: row.question,
                acceptance,
                sessionId,
                first,
                second: null,
                status: 'error'
            })
            console.log(`  -> FIRST ERROR ${first.error}`)
            continue
        }

        if (first.trace.route !== 'skill_answered') {
            results.push({
                index: index + 1,
                poolId: row.no,
                question: row.question,
                acceptance,
                sessionId,
                first,
                second: null,
                status: 'first_not_skill'
            })
            console.log(`  -> FIRST ${first.trace.route}, skip acceptance`)
            continue
        }

        let second: FollowupResult['second']
        try {
            second = await askAndTrace({
                supabase: input.supabase,
                channel: input.channel,
                baseUrl: input.args.baseUrl,
                slug: input.args.slug,
                token: input.token,
                sessionId,
                message: acceptance
            })
        } catch (error) {
            second = {
                answer: '',
                messageId: null,
                durationMs: 0,
                httpStatuses: [],
                trace: emptyTrace(first.trace.conversationId, ''),
                error: error instanceof Error ? error.message : String(error)
            }
        }

        const status = followupStatus(first.trace, second?.trace ?? null, second?.error ?? null)
        results.push({
            index: index + 1,
            poolId: row.no,
            question: row.question,
            acceptance,
            sessionId,
            first,
            second,
            status
        })
        console.log(`  -> ${status}${second?.trace.matchedSkillTitle ? ` (${second.trace.matchedSkillTitle})` : ''}`)
    }

    return { selected, results }
}

async function writeArtifacts(input: {
    args: Args
    runId: string
    routing?: Awaited<ReturnType<typeof runRoutingEval>>
    followup?: Awaited<ReturnType<typeof runFollowupEval>>
}) {
    await mkdir(input.args.outDir, { recursive: true })
    await mkdir(input.args.docsDir, { recursive: true })

    if (input.routing) {
        const jsonPath = path.join(input.args.outDir, `yiu-routing-random-${input.routing.selected.length}-${input.runId}.json`)
        const mdPath = path.join(input.args.docsDir, `yiu-routing-random-${input.routing.selected.length}-${input.runId}.md`)
        await writeFile(jsonPath, JSON.stringify({
            runId: input.runId,
            baseUrl: input.args.baseUrl,
            slug: input.args.slug,
            seed: input.args.seed,
            selected: input.routing.selected,
            summary: summarizeRouting(input.routing.results),
            results: input.routing.results
        }, null, 2), 'utf8')
        await writeFile(mdPath, renderRoutingMarkdown({
            runId: input.runId,
            baseUrl: input.args.baseUrl,
            slug: input.args.slug,
            seed: input.args.seed,
            selected: input.routing.selected,
            results: input.routing.results
        }), 'utf8')
        console.log(`ROUTING_JSON ${jsonPath}`)
        console.log(`ROUTING_MD ${mdPath}`)
    }

    if (input.followup) {
        const jsonPath = path.join(input.args.outDir, `yiu-followup-skill-random-${input.followup.selected.length}-${input.runId}.json`)
        const mdPath = path.join(input.args.docsDir, `yiu-followup-skill-random-${input.followup.selected.length}-${input.runId}.md`)
        await writeFile(jsonPath, JSON.stringify({
            runId: input.runId,
            baseUrl: input.args.baseUrl,
            slug: input.args.slug,
            seed: input.args.seed,
            selected: input.followup.selected,
            summary: summarizeFollowups(input.followup.results),
            results: input.followup.results
        }, null, 2), 'utf8')
        await writeFile(mdPath, renderFollowupMarkdown({
            runId: input.runId,
            baseUrl: input.args.baseUrl,
            slug: input.args.slug,
            seed: input.args.seed,
            selected: input.followup.selected,
            results: input.followup.results
        }), 'utf8')
        console.log(`FOLLOWUP_JSON ${jsonPath}`)
        console.log(`FOLLOWUP_MD ${mdPath}`)
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    await loadProjectEnv()
    const rows = parseCustomerEvaluationRows(
        await readFile(path.resolve(args.questionDoc), 'utf8')
    ).map((row) => ({
        no: row.no,
        question: row.question,
        originalScore: row.originalScore
    }))

    const routingSelected = sampleRows(rows, args.routingCount, `${args.seed}:routing`)
    const followupSelected = sampleRows(rows, args.followupCount, `${args.seed}:followup`)

    if (args.dryRun) {
        console.log(JSON.stringify({
            rowCount: rows.length,
            routingSelected: routingSelected.map((row) => ({ no: row.no, question: row.question })),
            followupSelected: followupSelected.map((row) => ({ no: row.no, question: row.question }))
        }, null, 2))
        return
    }

    const supabase = createClient(
        requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )
    const channel = await resolveDemoChatChannel({ supabase, slug: args.slug })
    if (!channel) throw new Error(`Demo channel not found: ${args.slug}`)
    const token = createDemoChatAccessToken({ channel, ttlMs: 4 * 60 * 60 * 1000 })
    if (!token) throw new Error(`Demo channel has no shared secret: ${args.slug}`)

    const runId = new Date().toISOString().replace(/[:.]/g, '-')
    let routing: Awaited<ReturnType<typeof runRoutingEval>> | undefined
    let followup: Awaited<ReturnType<typeof runFollowupEval>> | undefined

    if (args.mode === 'routing' || args.mode === 'both') {
        routing = await runRoutingEval({
            rows,
            supabase: supabase as unknown as SupabaseClientLike,
            channel,
            token,
            args,
            runId
        })
    }

    if (args.mode === 'followup' || args.mode === 'both') {
        followup = await runFollowupEval({
            rows,
            supabase: supabase as unknown as SupabaseClientLike,
            channel,
            token,
            args,
            runId
        })
    }

    await writeArtifacts({ args, runId, routing, followup })

    if (routing) {
        console.log('ROUTING_SUMMARY', JSON.stringify(summarizeRouting(routing.results)))
    }
    if (followup) {
        console.log('FOLLOWUP_SUMMARY', JSON.stringify(summarizeFollowups(followup.results)))
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
