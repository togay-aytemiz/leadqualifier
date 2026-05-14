import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_MAX_TOKENS = 650
const DEFAULT_OVERLAP_TOKENS = 100
const DEFAULT_SAMPLE_LIMIT = 5
const DEFAULT_BOILERPLATE_LINES = new Set([
    'Kapat',
    'Web Asistan Menü',
    'Web Asistan Menüsü',
    'Kayıt İşlemleri',
    'Tanıtım Videosu',
    'Ücretler ve Burslar',
    'Tıp Fak. Whatsapp Destek Hattı',
    'Sağlık Bilimler Fakültesi Whatsapp Destek Hattı',
    'Yüksekokullar Whatsapp Destek Hattı',
    'Uluslararası WhatsApp',
    'Sıkça Sorulan Sorular',
    'Aydınlatma Metni',
    'Geri',
    'İleri'
].map(canonicalLine))

function wordsFromText(text) {
    return String(text ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
}

export function estimateTokenCount(text) {
    return wordsFromText(text).length
}

function normalizeWhitespace(text) {
    return String(text ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

function canonicalLine(line) {
    return normalizeWhitespace(line)
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('tr-TR')
}

export function cleanCrawlerBoilerplate(content) {
    return normalizeWhitespace(String(content ?? '')
        .split('\n')
        .filter((line) => !DEFAULT_BOILERPLATE_LINES.has(canonicalLine(line)))
        .join('\n'))
}

function hasLetter(text) {
    return /\p{L}/u.test(String(text ?? ''))
}

function boilerplateCandidateLines(content, maxTokens) {
    const seen = new Set()
    const candidates = []

    for (const line of String(content ?? '').split('\n')) {
        const normalized = canonicalLine(line)
        if (!normalized || seen.has(normalized)) continue
        if (!hasLetter(normalized)) continue
        if (normalized.length > 120) continue
        if (estimateTokenCount(normalized) > maxTokens) continue

        seen.add(normalized)
        candidates.push(normalized)
    }

    return candidates
}

export function detectCommonBoilerplateLines(pages, options = {}) {
    const safePages = Array.isArray(pages) ? pages : []
    const minRatio = Number(options.commonLineMinRatio ?? 0.15)
    const minPages = Number(options.commonLineMinPages ?? 20)
    const maxTokens = Number(options.commonLineMaxTokens ?? 12)
    const threshold = Math.max(
        Number.isFinite(minPages) ? minPages : 20,
        Math.ceil(safePages.length * (Number.isFinite(minRatio) ? minRatio : 0.15))
    )
    const counts = new Map()

    for (const page of safePages) {
        for (const line of boilerplateCandidateLines(page?.content, maxTokens)) {
            counts.set(line, (counts.get(line) ?? 0) + 1)
        }
    }

    return [...counts.entries()]
        .filter(([, count]) => count >= threshold)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([line, count]) => ({ line, count }))
}

export function removeCommonBoilerplateLines(content, commonLines) {
    const lineSet = commonLines instanceof Set
        ? commonLines
        : new Set((Array.isArray(commonLines) ? commonLines : []).map((entry) => {
            return typeof entry === 'string' ? entry : entry.line
        }))

    return normalizeWhitespace(String(content ?? '')
        .split('\n')
        .filter((line) => !lineSet.has(canonicalLine(line)))
        .join('\n'))
}

function firstMatch(text, pattern) {
    return String(text ?? '').match(pattern)?.[1]?.trim() ?? null
}

export function parseCrawlMarkdown(markdown, fallback = {}) {
    const raw = String(markdown ?? '')
    const title = firstMatch(raw, /^#\s+(.+)$/m) || fallback.title || 'Untitled page'
    const sourceUrl = firstMatch(raw, /^Source URL:\s*(.+)$/m) || fallback.sourceUrl || fallback.url || ''
    const crawledAt = firstMatch(raw, /^Crawled At:\s*(.+)$/m) || fallback.crawledAt || null
    const contentMarker = raw.match(/^##\s+Content\s*$/m)
    let content = contentMarker ? raw.slice((contentMarker.index ?? 0) + contentMarker[0].length) : raw

    if (!contentMarker) {
        content = content
            .replace(/^#\s+.+$/m, '')
            .replace(/^Source URL:\s*.+$/m, '')
            .replace(/^Crawled At:\s*.+$/m, '')
    }

    return {
        title,
        sourceUrl,
        crawledAt,
        content: cleanCrawlerBoilerplate(content)
    }
}

function cleanHeading(line) {
    return String(line ?? '')
        .replace(/^#{1,6}\s+/, '')
        .trim()
}

function splitIntoSections(content) {
    const lines = normalizeWhitespace(content).split('\n')
    const sections = []
    let current = {
        title: 'Main content',
        lines: []
    }

    for (const line of lines) {
        if (/^#{2,6}\s+/.test(line)) {
            if (current.lines.join('\n').trim()) {
                sections.push(current)
            }
            current = {
                title: cleanHeading(line),
                lines: []
            }
            continue
        }

        current.lines.push(line)
    }

    if (current.lines.join('\n').trim()) {
        sections.push(current)
    }

    if (sections.length === 0 && normalizeWhitespace(content)) {
        sections.push({
            title: 'Main content',
            lines: [normalizeWhitespace(content)]
        })
    }

    return sections
}

function splitLongBlock(block, maxTokens) {
    const words = wordsFromText(block)
    if (words.length <= maxTokens) return [normalizeWhitespace(block)]

    const parts = []
    for (let index = 0; index < words.length; index += maxTokens) {
        parts.push(words.slice(index, index + maxTokens).join(' '))
    }
    return parts
}

function sectionBlocks(section, maxTokens) {
    const rawBlocks = section.lines
        .join('\n')
        .split(/\n\s*\n+/)
        .map(normalizeWhitespace)
        .filter(Boolean)

    return rawBlocks.flatMap((block) => splitLongBlock(block, maxTokens))
}

function lastWords(text, count) {
    if (count <= 0) return ''
    const words = wordsFromText(text)
    return words.slice(Math.max(0, words.length - count)).join(' ')
}

function buildChunkContent({ title, sourceUrl, sectionTitle, body }) {
    const header = [
        `Page Title: ${title}`,
        sourceUrl ? `Source URL: ${sourceUrl}` : null,
        `Section: ${sectionTitle}`
    ].filter(Boolean).join('\n')

    return `${header}\n\n${normalizeWhitespace(body)}`.trim()
}

export function createWebsiteChunks(page, options = {}) {
    const maxTokens = Number(options.maxTokens ?? DEFAULT_MAX_TOKENS)
    const overlapTokens = Math.max(0, Number(options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS))
    const safeMaxTokens = Number.isFinite(maxTokens) && maxTokens > 20 ? maxTokens : DEFAULT_MAX_TOKENS
    const title = page?.title || 'Untitled page'
    const sourceUrl = page?.sourceUrl || ''
    const sections = splitIntoSections(page?.content || '')
    const chunks = []
    let chunkIndex = 1
    let previousBody = ''

    for (const section of sections) {
        const prefixTokens = estimateTokenCount(buildChunkContent({
            title,
            sourceUrl,
            sectionTitle: section.title,
            body: ''
        }))
        const bodyBudget = Math.max(12, safeMaxTokens - prefixTokens - overlapTokens)
        const blocks = sectionBlocks(section, bodyBudget)
        let currentBody = ''

        const flush = () => {
            const trimmedBody = normalizeWhitespace(currentBody)
            if (!trimmedBody) return

            const overlap = chunks.length > 0 ? lastWords(previousBody, overlapTokens) : ''
            const body = normalizeWhitespace([overlap, trimmedBody].filter(Boolean).join('\n\n'))
            const content = buildChunkContent({
                title,
                sourceUrl,
                sectionTitle: section.title,
                body
            })

            chunks.push({
                pageTitle: title,
                sourceUrl,
                sectionTitle: section.title,
                chunkIndex,
                content,
                tokenCount: estimateTokenCount(content)
            })
            chunkIndex += 1
            previousBody = trimmedBody
            currentBody = ''
        }

        for (const block of blocks) {
            const candidate = normalizeWhitespace([currentBody, block].filter(Boolean).join('\n\n'))
            if (currentBody && estimateTokenCount(candidate) > bodyBudget) {
                flush()
                currentBody = block
            } else {
                currentBody = candidate
            }
        }

        flush()
    }

    return chunks
}

async function exists(filePath) {
    try {
        await stat(filePath)
        return true
    } catch {
        return false
    }
}

async function readCorpusManifest(crawlOutputDir) {
    const reportPath = path.join(crawlOutputDir, 'corpus-report.json')
    if (!(await exists(reportPath))) return null

    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    if (!Array.isArray(report.corpusPages)) return null

    return report.corpusPages
        .filter((page) => page?.corpusPath)
        .map((page) => ({
            title: page.title,
            sourceUrl: page.url,
            corpusPath: page.corpusPath,
            wordCount: page.wordCount
        }))
}

async function scanCorpusDirectory(crawlOutputDir) {
    const corpusDir = path.join(crawlOutputDir, 'corpus')
    const files = await readdir(corpusDir)

    return files
        .filter((file) => file.endsWith('.md'))
        .sort((left, right) => left.localeCompare(right))
        .map((file) => ({
            title: path.basename(file, '.md'),
            sourceUrl: '',
            corpusPath: path.join('corpus', file)
        }))
}

async function readCorpusPages(crawlOutputDir, limit) {
    const manifestPages = await readCorpusManifest(crawlOutputDir)
    const pages = manifestPages ?? await scanCorpusDirectory(crawlOutputDir)
    const selectedPages = Number.isFinite(limit) && limit > 0 ? pages.slice(0, limit) : pages
    const parsedPages = []

    for (const page of selectedPages) {
        const markdownPath = path.join(crawlOutputDir, page.corpusPath)
        const markdown = await readFile(markdownPath, 'utf8')
        parsedPages.push({
            ...parseCrawlMarkdown(markdown, page),
            corpusPath: page.corpusPath,
            wordCount: page.wordCount ?? estimateTokenCount(markdown)
        })
    }

    return parsedPages
}

function numberSummary(values) {
    if (values.length === 0) {
        return { min: 0, max: 0, avg: 0 }
    }

    const total = values.reduce((sum, value) => sum + value, 0)
    return {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: Math.round(total / values.length)
    }
}

export async function buildDryRunReport(options = {}) {
    const crawlOutputDir = options.crawlOutputDir
    if (!crawlOutputDir) {
        throw new Error('crawlOutputDir is required')
    }

    const sampleLimit = Number(options.sampleLimit ?? DEFAULT_SAMPLE_LIMIT)
    let pages = await readCorpusPages(crawlOutputDir, Number(options.maxPages))
    const commonBoilerplate = detectCommonBoilerplateLines(pages, options)
    const commonBoilerplateLineSet = new Set(commonBoilerplate.map((entry) => entry.line))
    pages = pages.map((page) => ({
        ...page,
        content: removeCommonBoilerplateLines(page.content, commonBoilerplateLineSet)
    }))
    const pageReports = []
    const sampleChunks = []
    let totalChunks = 0
    let databaseWrites = 0
    const tokenCounts = []

    for (const page of pages) {
        const chunks = createWebsiteChunks(page, options)
        if (chunks.length > 0) {
            databaseWrites += 0
        }

        totalChunks += chunks.length
        tokenCounts.push(...chunks.map((chunk) => chunk.tokenCount))
        pageReports.push({
            title: page.title,
            sourceUrl: page.sourceUrl,
            corpusPath: page.corpusPath,
            sourceWords: page.wordCount,
            chunkCount: chunks.length,
            tokenSummary: numberSummary(chunks.map((chunk) => chunk.tokenCount))
        })

        if (sampleChunks.length < sampleLimit) {
            sampleChunks.push(...chunks.slice(0, sampleLimit - sampleChunks.length).map((chunk) => ({
                pageTitle: chunk.pageTitle,
                sourceUrl: chunk.sourceUrl,
                sectionTitle: chunk.sectionTitle,
                tokenCount: chunk.tokenCount,
                preview: chunk.content.slice(0, 500)
            })))
        }
    }

    const pagesWithChunks = pageReports.filter((page) => page.chunkCount > 0).length
    const emptyPages = pageReports.filter((page) => page.chunkCount === 0)
    const largestPages = [...pageReports]
        .sort((left, right) => right.chunkCount - left.chunkCount || (right.sourceWords ?? 0) - (left.sourceWords ?? 0))
        .slice(0, 10)

    return {
        dryRun: true,
        generatedAt: new Date().toISOString(),
        crawlOutputDir,
        pagesRead: pageReports.length,
        pagesWithChunks,
        emptyPages: emptyPages.length,
        totalChunks,
        databaseWrites,
        tokenSummary: numberSummary(tokenCounts),
        avgChunksPerPage: pageReports.length > 0 ? Number((totalChunks / pageReports.length).toFixed(2)) : 0,
        commonBoilerplateLines: commonBoilerplate.map((entry) => entry.line),
        commonBoilerplateLineSamples: commonBoilerplate.slice(0, 30),
        largestPages,
        sampleChunks,
        warnings: emptyPages.slice(0, 20).map((page) => `No chunks created for ${page.sourceUrl || page.corpusPath}`),
        pages: pageReports
    }
}

export function renderImportReport(report) {
    const lines = [
        '# Crawl Corpus RAG Import Report',
        '',
        `Generated at: ${report.generatedAt}`,
        `Dry run: ${report.dryRun ? 'yes' : 'no'}`,
        `Crawler output: ${report.crawlOutputDir}`,
        '',
        '## Summary',
        '',
        `- Pages read: ${report.pagesRead}`,
        `- Pages with chunks: ${report.pagesWithChunks}`,
        `- Empty pages: ${report.emptyPages}`,
        `- Total chunks: ${report.totalChunks}`,
        `- Avg chunks per page: ${report.avgChunksPerPage}`,
        `- Chunk tokens min/avg/max: ${report.tokenSummary.min}/${report.tokenSummary.avg}/${report.tokenSummary.max}`,
        `- Dynamic boilerplate lines removed: ${report.commonBoilerplateLines.length}`,
        `- Database writes: ${report.databaseWrites}`,
        '',
        '## Largest Pages',
        '',
        ...report.largestPages.map((page) => {
            return `- ${page.chunkCount} chunks | ${page.title} | ${page.sourceUrl || page.corpusPath}`
        }),
        '',
        '## Sample Chunks',
        ''
    ]

    for (const chunk of report.sampleChunks) {
        lines.push(`### ${chunk.pageTitle}`)
        lines.push('')
        lines.push(`Source: ${chunk.sourceUrl}`)
        lines.push(`Section: ${chunk.sectionTitle}`)
        lines.push(`Tokens: ${chunk.tokenCount}`)
        lines.push('')
        lines.push('```text')
        lines.push(chunk.preview)
        lines.push('```')
        lines.push('')
    }

    if (report.commonBoilerplateLineSamples.length > 0) {
        lines.push('## Dynamic Boilerplate Samples')
        lines.push('')
        lines.push(...report.commonBoilerplateLineSamples.map((entry) => {
            return `- ${entry.count} pages | ${entry.line}`
        }))
        lines.push('')
    }

    if (report.warnings.length > 0) {
        lines.push('## Warnings')
        lines.push('')
        lines.push(...report.warnings.map((warning) => `- ${warning}`))
        lines.push('')
    }

    return `${lines.join('\n').trim()}\n`
}

export async function writeImportReport(report, reportPath) {
    await writeFile(reportPath, renderImportReport(report), 'utf8')
}
