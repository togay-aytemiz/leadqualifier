import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ORG_ID = process.env.QA_ORG_ID?.trim() || '37222032-c2e8-4125-a027-be39eb6603f8'
const PAGE_SIZE = 1000

type DocumentRow = {
    id: string
    title: string | null
    type: string | null
    source: string | null
    status: string | null
    content: string | null
    language: string | null
    collection_id: string | null
    created_at: string | null
    updated_at: string | null
}

type ChunkRow = {
    id: string
    document_id: string
    chunk_index: number | null
    content: string | null
    token_count: number | null
}

type TermCheck = {
    label: string
    terms: string[]
}

const TERM_CHECKS: TermCheck[] = [
    { label: 'campus-current-locations', terms: ['Bağlıca', 'Bağlum', 'Balgat'] },
    { label: 'tlt-program', terms: ['Tıbbi Laboratuvar Teknikleri', 'Yaz Stajı', 'çift anadal'] },
    { label: 'elective-policy', terms: ['seçmeli ders', 'Yüksekokul Kurulu', 'Fakülte Kurulu'] },
    { label: 'medicine-exam-policy', terms: ['mazeret sınavı', 'bütünleme sınavı', 'Dönem VI'] },
    { label: 'learning-platforms', terms: ['UZEM', 'MEDU', 'ders not'] },
    { label: 'personnel-leave', terms: ['yıllık izin', '14 iş günü', '26 iş günü'] }
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
        // CI and local shells can provide env directly.
    }
}

function requireEnv(name: string) {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`Missing required env var: ${name}`)
    return value
}

function normalize(value: string) {
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

function extractSourceUrl(content: string | null | undefined) {
    return content?.match(/^Source URL:\s*(.+)$/im)?.[1]?.trim() ?? ''
}

function hasBrokenUrl(content: string | null | undefined) {
    return /https?:\/\/[^\s]*\s+\.[a-z]{2,}|https?:\/\/[^\s]+\.\s+[a-z]{2,}/i.test(content ?? '')
}

async function selectAll<T>(
    queryFactory: () => {
        range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
    }
) {
    const rows: T[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
        const to = from + PAGE_SIZE - 1
        const { data, error } = await queryFactory().range(from, to)
        if (error) throw error
        const page = (data ?? []) as T[]
        rows.push(...page)
        if (page.length < PAGE_SIZE) return rows
    }
}

function topValues(values: string[], limit = 12) {
    const counts = new Map<string, number>()
    for (const value of values) {
        if (!value) continue
        counts.set(value, (counts.get(value) ?? 0) + 1)
    }

    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'tr'))
        .slice(0, limit)
        .map(([value, count]) => ({ value, count }))
}

function renderMarkdown(report: ReturnType<typeof buildReport>) {
    const lines = [
        '# YIU Corpus Health Report',
        '',
        `Run: ${report.runId}`,
        `Organization: ${report.organizationId}`,
        '',
        '## Summary',
        '',
        `- Documents: ${report.summary.documents}`,
        `- Ready documents: ${report.summary.readyDocuments}`,
        `- Chunks: ${report.summary.chunks}`,
        `- Documents without chunks: ${report.summary.readyDocumentsWithoutChunks.length}`,
        `- Empty chunks: ${report.summary.emptyChunks.length}`,
        `- Oversized chunks: ${report.summary.oversizedChunks.length}`,
        `- Missing source URLs: ${report.summary.missingSourceUrls.length}`,
        `- Broken URL text findings: ${report.summary.brokenUrlDocuments.length + report.summary.brokenUrlChunks.length}`,
        '',
        '## Document Types',
        '',
        ...report.documentTypes.map((row) => `- ${row.value}: ${row.count}`),
        '',
        '## Term Coverage',
        '',
        '| Check | Matching documents | Matching chunks | Missing terms |',
        '|---|---:|---:|---|',
        ...report.termCoverage.map((row) => `| ${row.label} | ${row.documentMatches} | ${row.chunkMatches} | ${row.missingTerms.join(', ') || '-'} |`),
        '',
        '## Highest-Risk Findings',
        ''
    ]

    const findings = [
        ...report.summary.readyDocumentsWithoutChunks.slice(0, 10).map((item) => `- Ready document without chunks: ${item.title} (${item.id})`),
        ...report.summary.missingSourceUrls.slice(0, 10).map((item) => `- Missing Source URL: ${item.title} (${item.id})`),
        ...report.summary.oversizedChunks.slice(0, 10).map((item) => `- Oversized chunk: ${item.documentTitle} / chunk ${item.chunkIndex} (${item.length} chars, token_count=${item.tokenCount ?? 'n/a'})`),
        ...report.summary.brokenUrlDocuments.slice(0, 10).map((item) => `- Broken URL text in document: ${item.title} (${item.id})`),
        ...report.summary.brokenUrlChunks.slice(0, 10).map((item) => `- Broken URL text in chunk: ${item.documentTitle} / chunk ${item.chunkIndex}`)
    ]

    if (findings.length === 0) {
        lines.push('- No high-risk corpus health findings in this scan.')
    } else {
        lines.push(...findings)
    }

    lines.push('')
    return `${lines.join('\n')}\n`
}

function buildReport(input: {
    runId: string
    organizationId: string
    documents: DocumentRow[]
    chunks: ChunkRow[]
}) {
    const chunksByDocumentId = new Map<string, ChunkRow[]>()
    for (const chunk of input.chunks) {
        const rows = chunksByDocumentId.get(chunk.document_id) ?? []
        rows.push(chunk)
        chunksByDocumentId.set(chunk.document_id, rows)
    }

    const documentsById = new Map(input.documents.map((document) => [document.id, document]))
    const readyDocuments = input.documents.filter((document) => document.status === 'ready')
    const missingSourceUrls = readyDocuments
        .filter((document) => !extractSourceUrl(document.content))
        .map((document) => ({ id: document.id, title: document.title ?? 'Untitled', type: document.type ?? 'unknown' }))
    const readyDocumentsWithoutChunks = readyDocuments
        .filter((document) => (chunksByDocumentId.get(document.id) ?? []).length === 0)
        .map((document) => ({ id: document.id, title: document.title ?? 'Untitled', type: document.type ?? 'unknown' }))
    const emptyChunks = input.chunks
        .filter((chunk) => !(chunk.content ?? '').trim())
        .map((chunk) => ({
            id: chunk.id,
            documentId: chunk.document_id,
            documentTitle: documentsById.get(chunk.document_id)?.title ?? 'Untitled',
            chunkIndex: chunk.chunk_index
        }))
    const oversizedChunks = input.chunks
        .filter((chunk) => (chunk.content ?? '').length > 6500 || Number(chunk.token_count ?? 0) > 1300)
        .map((chunk) => ({
            id: chunk.id,
            documentId: chunk.document_id,
            documentTitle: documentsById.get(chunk.document_id)?.title ?? 'Untitled',
            chunkIndex: chunk.chunk_index,
            length: (chunk.content ?? '').length,
            tokenCount: chunk.token_count
        }))
    const brokenUrlDocuments = readyDocuments
        .filter((document) => hasBrokenUrl(document.content))
        .map((document) => ({ id: document.id, title: document.title ?? 'Untitled' }))
    const brokenUrlChunks = input.chunks
        .filter((chunk) => hasBrokenUrl(chunk.content))
        .map((chunk) => ({
            id: chunk.id,
            documentId: chunk.document_id,
            documentTitle: documentsById.get(chunk.document_id)?.title ?? 'Untitled',
            chunkIndex: chunk.chunk_index
        }))

    const normalizedDocuments = input.documents.map((document) => normalize(`${document.title ?? ''}\n${document.content ?? ''}`))
    const normalizedChunks = input.chunks.map((chunk) => normalize(chunk.content ?? ''))
    const termCoverage = TERM_CHECKS.map((check) => {
        const normalizedTerms = check.terms.map(normalize)
        const documentMatches = normalizedDocuments.filter((document) => normalizedTerms.some((term) => document.includes(term))).length
        const chunkMatches = normalizedChunks.filter((chunk) => normalizedTerms.some((term) => chunk.includes(term))).length
        const missingTerms = check.terms.filter((term) => {
            const normalizedTerm = normalize(term)
            return !normalizedDocuments.some((document) => document.includes(normalizedTerm))
        })

        return {
            label: check.label,
            terms: check.terms,
            documentMatches,
            chunkMatches,
            missingTerms
        }
    })

    return {
        runId: input.runId,
        organizationId: input.organizationId,
        summary: {
            documents: input.documents.length,
            readyDocuments: readyDocuments.length,
            chunks: input.chunks.length,
            missingSourceUrls,
            readyDocumentsWithoutChunks,
            emptyChunks,
            oversizedChunks,
            brokenUrlDocuments,
            brokenUrlChunks
        },
        documentTypes: topValues(input.documents.map((document) => document.type ?? 'unknown')),
        documentStatuses: topValues(input.documents.map((document) => document.status ?? 'unknown')),
        duplicateSourceUrls: topValues(input.documents.map((document) => extractSourceUrl(document.content)).filter(Boolean))
            .filter((row) => row.count > 1),
        termCoverage
    }
}

async function main() {
    await loadProjectEnv()
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

    const runId = new Date().toISOString().replace(/[:.]/g, '-')
    const documents = await selectAll<DocumentRow>(() => supabase
        .from('knowledge_documents')
        .select('id, title, type, source, status, content, language, collection_id, created_at, updated_at')
        .eq('organization_id', ORG_ID)
        .order('created_at', { ascending: true }))
    const chunks = await selectAll<ChunkRow>(() => supabase
        .from('knowledge_chunks')
        .select('id, document_id, chunk_index, content, token_count')
        .eq('organization_id', ORG_ID)
        .order('document_id', { ascending: true })
        .order('chunk_index', { ascending: true }))
    const report = buildReport({
        runId,
        organizationId: ORG_ID,
        documents,
        chunks
    })

    const outputDir = path.join(process.cwd(), 'tmp', 'crawl-output')
    await mkdir(outputDir, { recursive: true })
    const jsonPath = path.join(outputDir, `yiu-corpus-health-${runId}.json`)
    const mdPath = path.join(outputDir, `yiu-corpus-health-${runId}.md`)
    await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8')
    await writeFile(mdPath, renderMarkdown(report), 'utf8')

    console.log(`Documents ${report.summary.documents}`)
    console.log(`Chunks ${report.summary.chunks}`)
    console.log(`Ready documents without chunks ${report.summary.readyDocumentsWithoutChunks.length}`)
    console.log(`Missing source URLs ${report.summary.missingSourceUrls.length}`)
    console.log(`Oversized chunks ${report.summary.oversizedChunks.length}`)
    console.log(`JSON ${jsonPath}`)
    console.log(`MD ${mdPath}`)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
