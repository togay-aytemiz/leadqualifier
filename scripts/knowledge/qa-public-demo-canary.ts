import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createDemoChatAccessToken } from '@/lib/demo-chat/access'
import { buildDemoChatContactId, resolveDemoChatChannel } from '@/lib/demo-chat/channel'

type CanaryCase = {
    id: string
    question: string
    mustContain?: string[]
    anyOf?: string[][]
    requiresUrl?: boolean
    forbid?: RegExp[]
    notes?: string
}

type CanaryResult = {
    index: number
    id: string
    question: string
    answer: string
    sessionId: string
    messageId: string | null
    conversationId: string | null
    sourceDocumentIds: string[]
    sourceTitles: string[]
    sourceUrls: string[]
    status: 'pass' | 'fail'
    failures: string[]
    durationMs: number
    httpStatuses: number[]
    notes: string
}

type DemoChannel = NonNullable<Awaited<ReturnType<typeof resolveDemoChatChannel>>>

type DemoTrace = {
    conversationId: string | null
    sourceDocumentIds: string[]
    sourceTitles: string[]
    sourceUrls: string[]
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

const DEFAULT_BASE_URL = 'https://app.askqualy.com'
const DEFAULT_SLUG = 'yiu-qualy-ai-demo'
const DEFAULT_LOCALE = 'tr'
const DEFAULT_FETCH_TIMEOUT_MS = 30000
const POLL_INTERVAL_MS = 1500
const POLL_ATTEMPTS = 40
const NO_INFO_FORBID = /Bu konuda elimde net bilgi yok|NO_ANSWER/i
const FOOTER_ADDRESS_FORBID = /Yüksek İhtisas Üniversitesi Rektörlüğü,?\s*06530|Rektörlüğü,?\s*06530/i
const MARKDOWN_LINK_FORBID = /\[[^\]]+\]\(https?:\/\/[^)]+\)/i
const BROKEN_URL_FORBID = /https?:\/\/[^\s]*\s+\.[a-z]{2,}|https?:\/\/[^\s]+\.\s+[a-z]{2,}/i
const INCORRECT_MAKEUP_DENIAL_FORBID = /^\s*Hayır\b|finale?\s+girmeden\s+bütünleme(?:\s+sınavına)?\s+giremez|bütünlemeye\s+giremezsin|doğrudan\s+bütünlemeye\s+girme\s+hakkı\s+yok/i

const CASES: CanaryCase[] = [
    {
        id: 'sbf-campus',
        question: 'SBF kampüsü nerede?',
        mustContain: ['Bağlıca'],
        anyOf: [['Höyük', 'No:1', 'Yerleşkesi']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, FOOTER_ADDRESS_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'shmyo-campus',
        question: 'SHMYO kampüsü nerede?',
        anyOf: [['Bağlum', 'Balgat'], ['Karakaya', 'Oğuzlar', 'program']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, FOOTER_ADDRESS_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'tlt-contact',
        question: 'Tıbbi Laboratuvar Teknikleri programının iletişim bilgisi var mı?',
        mustContain: ['Tıbbi Laboratuvar Teknikleri'],
        anyOf: [['tlt@yiu.edu.tr'], ['+90 312 329 10 10', '0312 329 10 10']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, /kutuphane@/i, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'tlt-summer-internship',
        question: 'TLT programında yaz stajı var mı, kaç gün?',
        mustContain: ['Yaz Stajı'],
        anyOf: [['20 iş günü', '20']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'tlt-double-major',
        question: 'TLT öğrencisi ÇAP yapabilir mi?',
        mustContain: ['Eczane Hizmetleri'],
        anyOf: [['çift anadal', 'ÇAP']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'elective-count',
        question: 'Mezun olana kadar kaç seçmeli ders almalıyım?',
        mustContain: ['seçmeli ders'],
        anyOf: [['Fakülte Kurulu', 'Yüksekokul Kurulu', 'kurul']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'medicine-grade',
        question: 'Tıp fakültesinde sınıf geçme notu nasıl hesaplanıyor?',
        mustContain: ['%60', '%40'],
        anyOf: [['final', 'bütünleme'], ['60']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'medicine-excuse-exam',
        question: 'Tıp fakültesinde kurul sınavına hasta olduğum için giremedim. Başka sınav hakkım var mı?',
        mustContain: ['mazeret sınavı'],
        anyOf: [['sağlık raporu', 'Fakülte Yönetim Kurulu', 'yönetim kurulu']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'lecture-notes',
        question: 'Ders notlarına nereden ulaşabilirim?',
        anyOf: [['UZEM', 'MEDU']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, FOOTER_ADDRESS_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'medicine-duration',
        question: 'Tıp fakültesinde eğitim süresi ne kadar?',
        mustContain: ['altı', 'yıl'],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'final-makeup',
        question: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
        mustContain: ['Final sınavına girmesi gerektiği halde girmeyen'],
        anyOf: [['bütünleme sınavına girer', 'bütünlemeye girer', 'bütünleme sınavına girebilir', 'bütünlemeye girebilirsiniz']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, INCORRECT_MAKEUP_DENIAL_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    },
    {
        id: 'personnel-annual-leave',
        question: 'Personelin yıllık izin hakkı ne kadar?',
        mustContain: ['14', '20', '26'],
        anyOf: [['iş günü']],
        requiresUrl: true,
        forbid: [NO_INFO_FORBID, MARKDOWN_LINK_FORBID, BROKEN_URL_FORBID]
    }
]

function parseEnvValue(value: string) {
    const trimmed = value.trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

async function loadProjectEnv() {
    const envPath = path.join(process.cwd(), '.env')
    try {
        const content = await readFile(envPath, 'utf8')
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const separator = trimmed.indexOf('=')
            if (separator === -1) continue
            const key = trimmed.slice(0, separator).trim()
            if (!key || process.env[key]) continue
            process.env[key] = parseEnvValue(trimmed.slice(separator + 1))
        }
    } catch {
        // CI can provide env directly.
    }
}

function requireEnv(name: string) {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`Missing required env var: ${name}`)
    return value
}

function normalizeText(value: string) {
    return value
        .toLocaleLowerCase('tr')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/\s+/g, ' ')
        .trim()
}

function includesTerm(answer: string, term: string) {
    return normalizeText(answer).includes(normalizeText(term))
}

function evaluate(testCase: CanaryCase, answer: string) {
    const failures: string[] = []
    for (const term of testCase.mustContain ?? []) {
        if (!includesTerm(answer, term)) failures.push(`missing term: ${term}`)
    }

    for (const group of testCase.anyOf ?? []) {
        if (!group.some((term) => includesTerm(answer, term))) {
            failures.push(`missing any of: ${group.join(' | ')}`)
        }
    }

    if (testCase.requiresUrl && !/https:\/\/\S+/i.test(answer)) {
        failures.push('missing source URL')
    }

    for (const pattern of testCase.forbid ?? []) {
        if (pattern.test(answer)) failures.push(`forbidden pattern: ${pattern}`)
    }

    return failures
}

function readReplyPayload(data: unknown) {
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    return {
        pending: payload.pending === true,
        messageId: typeof payload.messageId === 'string' ? payload.messageId : '',
        response: typeof payload.response === 'string' ? payload.response.trim() : ''
    }
}

function readSourceIdsFromMetadata(metadata: Record<string, unknown> | null | undefined) {
    const rawSources = metadata?.sources
    if (!Array.isArray(rawSources)) return []

    return Array.from(new Set(rawSources
        .filter((source): source is string => typeof source === 'string' && source.trim().length > 0)
        .map((source) => source.trim())))
}

function extractSourceUrl(content: string | null | undefined) {
    return content?.match(/^Source URL:\s*(.+)$/im)?.[1]?.trim() ?? ''
}

async function loadDemoTrace(input: {
    supabase: SupabaseClientLike
    channel: DemoChannel
    sessionId: string
    messageId: string | null
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
        return {
            conversationId: null,
            sourceDocumentIds: [],
            sourceTitles: [],
            sourceUrls: []
        }
    }

    let messagesQuery = input.supabase
        .from('messages')
        .select('id, content, metadata')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'bot')
        .order('created_at', { ascending: false })
        .limit(5)

    if (input.messageId) {
        messagesQuery = messagesQuery.eq('metadata->>demo_chat_reply_to_message_id', input.messageId)
    }

    const { data: messages, error: messagesError } = await messagesQuery
    if (messagesError) throw messagesError

    const botMessage = ((messages ?? []) as BotMessageRow[])
        .find((message) => readSourceIdsFromMetadata(message.metadata).length > 0)
        ?? null
    const sourceDocumentIds = readSourceIdsFromMetadata(botMessage?.metadata)
    if (sourceDocumentIds.length === 0) {
        return {
            conversationId,
            sourceDocumentIds: [],
            sourceTitles: [],
            sourceUrls: []
        }
    }

    const { data: documents, error: documentsError } = await input.supabase
        .from('knowledge_documents')
        .select('id, title, type, content')
        .in('id', sourceDocumentIds)

    if (documentsError) throw documentsError

    const documentRows = (documents ?? []) as KnowledgeDocumentRow[]
    return {
        conversationId,
        sourceDocumentIds,
        sourceTitles: documentRows.map((document) => document.title || 'Untitled'),
        sourceUrls: Array.from(new Set(documentRows.map((document) => extractSourceUrl(document.content)).filter(Boolean)))
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
    fetchTimeoutMs: number
}) {
    const httpStatuses: number[] = []
    const endpoint = `${input.baseUrl.replace(/\/$/, '')}/api/demo/${encodeURIComponent(input.slug)}/chat`
    const initial = await fetchJson(endpoint, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${input.token}`,
            'content-type': 'application/json'
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
        let poll: Awaited<ReturnType<typeof fetchJson>>
        try {
            poll = await fetchJson(pollUrl.toString(), {
                headers: {
                    authorization: `Bearer ${input.token}`
                }
            }, input.fetchTimeoutMs)
        } catch (error) {
            if (attempt < POLL_ATTEMPTS - 1) {
                console.warn(`Poll attempt ${attempt + 1} failed for ${input.message}: ${error instanceof Error ? error.message : String(error)}`)
                continue
            }
            throw error
        }
        httpStatuses.push(poll.response.status)
        const pollPayload = readReplyPayload(poll.data)
        if (poll.response.status === 202 && pollPayload.pending) continue
        if (!poll.response.ok) throw new Error(`GET ${poll.response.status}: ${JSON.stringify(poll.data)}`)
        return { answer: pollPayload.response, httpStatuses, messageId: initialPayload.messageId || null }
    }

    throw new Error('Polling timed out')
}

function renderMarkdown(input: {
    baseUrl: string
    slug: string
    runId: string
    results: CanaryResult[]
}) {
    const passed = input.results.filter((result) => result.status === 'pass').length
    const lines = [
        `# Public Demo Canary Report`,
        '',
        `- Base URL: ${input.baseUrl}`,
        `- Slug: ${input.slug}`,
        `- Run ID: ${input.runId}`,
        `- Summary: ${passed}/${input.results.length}`,
        '',
        '| # | Case | Status | HTTP | Duration | Failures |',
        '|---:|---|---|---|---:|---|',
        ...input.results.map((result) => `| ${result.index} | ${result.id} | ${result.status.toUpperCase()} | ${result.httpStatuses.join(' -> ')} | ${result.durationMs}ms | ${result.failures.join('; ') || '-'} |`),
        ''
    ]

    for (const result of input.results) {
        lines.push(`## ${result.index}. ${result.id}`)
        lines.push('')
        lines.push(`**Question:** ${result.question}`)
        if (result.notes) lines.push(`**Notes:** ${result.notes}`)
        lines.push(`**Conversation:** ${result.conversationId ?? '-'}`)
        lines.push(`**Sources:** ${result.sourceTitles.join(' | ') || '-'}`)
        lines.push(`**Source URLs:** ${result.sourceUrls.join(' | ') || '-'}`)
        lines.push('')
        lines.push('**Answer:**')
        lines.push('')
        lines.push(result.answer || '(empty)')
        lines.push('')
    }

    return `${lines.join('\n')}\n`
}

async function main() {
    await loadProjectEnv()
    const baseUrl = process.env.PUBLIC_DEMO_BASE_URL?.trim() || DEFAULT_BASE_URL
    const slug = process.env.PUBLIC_DEMO_SLUG?.trim() || DEFAULT_SLUG
    const fetchTimeoutMs = Number.parseInt(process.env.PUBLIC_DEMO_FETCH_TIMEOUT_MS ?? '', 10) || DEFAULT_FETCH_TIMEOUT_MS
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
    const channel = await resolveDemoChatChannel({ supabase, slug })
    if (!channel) throw new Error(`Demo channel not found: ${slug}`)
    const token = createDemoChatAccessToken({ channel, ttlMs: 60 * 60 * 1000 })
    if (!token) throw new Error(`Demo channel has no shared secret: ${slug}`)

    const runId = new Date().toISOString().replace(/[:.]/g, '-')
    const selectedCases = process.env.PUBLIC_DEMO_CANARY_CASES
        ? CASES.filter((_, index) => process.env.PUBLIC_DEMO_CANARY_CASES?.split(',').map((item) => Number.parseInt(item.trim(), 10)).includes(index + 1))
        : CASES
    const results: CanaryResult[] = []

    for (let index = 0; index < selectedCases.length; index += 1) {
        const testCase = selectedCases[index]!
        const startedAt = Date.now()
        const sessionId = `codex-public-demo-canary-${runId}-${index + 1}`
        console.log(`ASK ${index + 1}. ${testCase.id}`)
        try {
            const { answer, httpStatuses, messageId } = await askDemo({
                baseUrl,
                slug,
                token,
                sessionId,
                message: testCase.question,
                fetchTimeoutMs
            })
            const trace = await loadDemoTrace({
                supabase: supabase as unknown as SupabaseClientLike,
                channel,
                sessionId,
                messageId
            })
            const failures = evaluate(testCase, answer)
            const result: CanaryResult = {
                index: index + 1,
                id: testCase.id,
                question: testCase.question,
                answer,
                sessionId,
                messageId,
                conversationId: trace.conversationId,
                sourceDocumentIds: trace.sourceDocumentIds,
                sourceTitles: trace.sourceTitles,
                sourceUrls: trace.sourceUrls,
                status: failures.length === 0 ? 'pass' : 'fail',
                failures,
                durationMs: Date.now() - startedAt,
                httpStatuses,
                notes: testCase.notes ?? ''
            }
            results.push(result)
            console.log(`${result.status.toUpperCase()} ${result.index}. ${result.id}`)
        } catch (error) {
            const failure = error instanceof Error ? error.message : String(error)
            results.push({
                index: index + 1,
                id: testCase.id,
                question: testCase.question,
                answer: '',
                sessionId,
                messageId: null,
                conversationId: null,
                sourceDocumentIds: [],
                sourceTitles: [],
                sourceUrls: [],
                status: 'fail',
                failures: [failure],
                durationMs: Date.now() - startedAt,
                httpStatuses: [],
                notes: testCase.notes ?? ''
            })
            console.log(`FAIL ${index + 1}. ${testCase.id}: ${failure}`)
        }
    }

    const outputDir = path.join(process.cwd(), 'tmp/crawl-output')
    await mkdir(outputDir, { recursive: true })
    const jsonPath = path.join(outputDir, `public-demo-canary-${runId}.json`)
    const mdPath = path.join(outputDir, `public-demo-canary-${runId}.md`)
    await writeFile(jsonPath, JSON.stringify({
        baseUrl,
        slug,
        locale: DEFAULT_LOCALE,
        runId,
        passed: results.filter((result) => result.status === 'pass').length,
        total: results.length,
        results
    }, null, 2))
    await writeFile(mdPath, renderMarkdown({ baseUrl, slug, runId, results }))

    const passed = results.filter((result) => result.status === 'pass').length
    console.log(`SUMMARY ${passed}/${results.length}`)
    console.log(`JSON ${jsonPath}`)
    console.log(`MD ${mdPath}`)

    if (passed !== results.length) {
        process.exitCode = 1
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
