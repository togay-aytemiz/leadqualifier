import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_MAX_TOKENS = 650
const DEFAULT_OVERLAP_TOKENS = 100
const DEFAULT_SAMPLE_LIMIT = 5
const DEFAULT_IMPORT_BATCH_SIZE = 50
const DEFAULT_EMBEDDING_BATCH_SIZE = 64
const DEFAULT_CHUNK_INSERT_BATCH_SIZE = 32
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
        .replace(/(https?:\/\/[^\s]+)\s+\.(?=[a-z]{2,}\b)/gi, '$1.')
        .replace(/(https?:\/\/[^\s]+)\.\s+(?=[a-z]{2,}\/?)/gi, '$1.')
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
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140)
        .trim()
}

function isShortHeadingLikeLine(value) {
    if (value.length < 4 || value.length > 110) return false
    if (!hasLetter(value)) return false
    if (/[.!?;,]$/.test(value)) return false
    if (estimateTokenCount(value) > 12) return false

    return true
}

function isMostlyUppercaseHeading(value) {
    const letters = String(value ?? '').match(/\p{L}/gu) ?? []
    if (letters.length < 4) return false

    const uppercaseLetters = letters.filter((letter) => letter === letter.toLocaleUpperCase('tr-TR')).length
    return uppercaseLetters / letters.length >= 0.72
}

function hasStandaloneHeadingContext(previousLine, nextLine) {
    const hasBoundaryBefore = !previousLine || !previousLine.trim()
    const hasBodyAfter = Boolean(nextLine?.trim())

    return hasBoundaryBefore && hasBodyAfter
}

function extractStructuredHeading(line, previousLine, nextLine) {
    const trimmedLine = String(line ?? '').trim()
    const markdownHeading = trimmedLine.match(/^#{2,6}\s+(.+)$/)
    if (markdownHeading?.[1]) return cleanHeading(markdownHeading[1])

    const normalized = cleanHeading(trimmedLine)
    if (!normalized) return null

    const legalArticleHeading = normalized.match(/^(?:MADDE|Madde|madde)\s+\d+[\p{L}0-9/]*(?:\s*[-–—:.]\s*[^.;!?]{1,100})?/u)
    if (legalArticleHeading?.[0]) return cleanHeading(legalArticleHeading[0])

    const numberedHeading = normalized.match(/^(?:\d+(?:\.\d+){0,4}|[IVXLCDM]+)\.?\s+.+$/iu)
    if (
        numberedHeading
        && !/^\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/.test(normalized)
        && hasStandaloneHeadingContext(previousLine, nextLine)
        && isShortHeadingLikeLine(normalized)
    ) {
        return normalized
    }

    if (
        hasStandaloneHeadingContext(previousLine, nextLine)
        && isShortHeadingLikeLine(normalized)
        && isMostlyUppercaseHeading(normalized)
    ) {
        return normalized
    }

    return null
}

function splitIntoSections(content) {
    const lines = normalizeWhitespace(content).split('\n')
    const headings = []

    for (let index = 0; index < lines.length; index += 1) {
        const title = extractStructuredHeading(lines[index], lines[index - 1], lines[index + 1])
        if (title) headings.push({ index, title })
    }

    if (headings.length === 0) {
        const normalizedContent = normalizeWhitespace(content)
        return normalizedContent
            ? [{ title: 'Main content', lines: [normalizedContent] }]
            : []
    }

    const sections = []
    if (headings[0]?.index && headings[0].index > 0) {
        const preamble = lines.slice(0, headings[0].index).join('\n').trim()
        if (preamble) {
            sections.push({
                title: 'Main content',
                lines: [preamble]
            })
        }
    }

    for (const [index, heading] of headings.entries()) {
        const nextHeading = headings[index + 1]
        const sectionLines = lines.slice(heading.index, nextHeading?.index ?? lines.length)
        if (sectionLines.join('\n').trim()) {
            sections.push({
                title: heading.title,
                lines: sectionLines
            })
        }
    }

    return sections
}

function splitTableCells(line) {
    const trimmed = String(line ?? '').trim()
    if (!trimmed.includes('|')) return []

    return trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => normalizeWhitespace(cell).replace(/\s+/g, ' '))
}

function isMarkdownTableSeparator(line) {
    const cells = splitTableCells(line)
    return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function hasMeaningfulTableCells(cells) {
    return cells.filter((cell) => cell && !/^:?-{3,}:?$/.test(cell)).length >= 2
}

function evidenceLabelFromText(value) {
    return normalizeWhitespace(value)
        .replace(/\s+/g, ' ')
        .slice(0, 90)
        .trim()
}

function buildTableRowEvidence(headers, cells, sectionTitle) {
    if (!hasMeaningfulTableCells(cells)) return null

    const pairs = cells
        .map((cell, index) => {
            const header = headers[index]?.trim()
            if (!cell) return null
            return header ? `${header}: ${cell}` : cell
        })
        .filter(Boolean)
    const content = pairs.join(' | ')
    if (!content) return null

    return {
        sectionTitle,
        content,
        evidenceType: 'table-row',
        evidenceLabel: evidenceLabelFromText(cells.find(Boolean) || content)
    }
}

function extractTableRowEvidenceBlocks(section) {
    const lines = section.lines.join('\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    const chunks = []

    for (let index = 0; index < lines.length - 1; index += 1) {
        const headerCells = splitTableCells(lines[index])
        if (headerCells.length < 2 || !isMarkdownTableSeparator(lines[index + 1])) continue

        let rowIndex = index + 2
        for (; rowIndex < lines.length; rowIndex += 1) {
            const rowCells = splitTableCells(lines[rowIndex])
            if (rowCells.length < 2) break

            const evidence = buildTableRowEvidence(headerCells, rowCells, section.title)
            if (evidence) chunks.push(evidence)
        }
        index = Math.max(index, rowIndex - 1)
    }

    return chunks
}

function isHighSignalEvidenceLine(line) {
    const rawLine = String(line ?? '').trim()
    const normalized = normalizeWhitespace(rawLine).replace(/\s+/g, ' ')
    if (normalized.length < 12 || normalized.length > 360) return false
    if (!hasLetter(normalized)) return false
    if (normalized.includes('|') || isMarkdownTableSeparator(normalized)) return false
    if (extractStructuredHeading(normalized, '', 'body')) return false

    const hasContactValue = /[\w.+-]+@[\w.-]+\.[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/u.test(normalized)
        || /(?:\+?\d[\d\s().-]{7,}\d)/.test(normalized)
    const hasAddressValue = /\b(?:no|no:|numara|cadde|caddesi|sokak|sokağı|bulvar|bulvarı|mahallesi)\b/iu.test(normalized)
    const hasCourseCode = /\b[A-ZÇĞİÖŞÜ]{2,}\s*\d{3}\b/u.test(normalized)
    const hasCompactValue = /\b\d+(?:[.,]\d+)?\s*(?:iş\s*günü|gün|hafta|ay|yıl|saat|akts|kredi)\b/iu.test(normalized)
        || /%\s*\d+|\d+\s*%/.test(normalized)
        || /\b\d+[.,]\d+\s*\/\s*\d+\b/.test(normalized)
    const looksLikeRow = /^[-*•]\s+/.test(rawLine)
        || /^\d+[.)]\s+/.test(rawLine)
        || /^\(?[A-Za-zÇĞİÖŞÜçğıöşü]\)?[.)]\s+/.test(rawLine)
        || /\t/.test(rawLine)
        || /\S\s{2,}\S/.test(rawLine)

    return hasContactValue
        || hasAddressValue
        || hasCourseCode
        || (looksLikeRow && hasCompactValue)
}

function extractEvidenceLineBlocks(section) {
    return section.lines
        .join('\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((line) => normalizeWhitespace(line).replace(/\s+/g, ' '))
        .filter(isHighSignalEvidenceLine)
        .map((line) => ({
            sectionTitle: section.title,
            content: line,
            evidenceType: 'evidence-row',
            evidenceLabel: evidenceLabelFromText(line)
        }))
}

function dedupeChunkBlocks(blocks) {
    const seen = new Set()
    const deduped = []

    for (const block of blocks) {
        const key = [
            block.sectionTitle || '',
            block.evidenceType || 'section',
            normalizeWhitespace(block.content).toLocaleLowerCase('tr-TR')
        ].join('::')
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(block)
    }

    return deduped
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

function buildChunkContent({ title, sourceUrl, sectionTitle, body, evidenceType, evidenceLabel }) {
    const header = [
        `Page Title: ${title}`,
        sourceUrl ? `Source URL: ${sourceUrl}` : null,
        `Section: ${sectionTitle}`,
        evidenceType ? `Evidence Type: ${evidenceType}` : null,
        evidenceLabel ? `Evidence Label: ${evidenceLabelFromText(evidenceLabel)}` : null
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

    for (const section of sections) {
        let previousBody = ''
        const prefixTokens = estimateTokenCount(buildChunkContent({
            title,
            sourceUrl,
            sectionTitle: section.title,
            body: ''
        }))
        const bodyBudget = Math.max(12, safeMaxTokens - prefixTokens - overlapTokens)
        const blocks = sectionBlocks(section, bodyBudget)
        let currentBody = ''

        const evidenceBlocks = dedupeChunkBlocks([
            ...extractTableRowEvidenceBlocks(section),
            ...extractEvidenceLineBlocks(section)
        ])
        for (const evidenceBlock of evidenceBlocks) {
            const content = buildChunkContent({
                title,
                sourceUrl,
                sectionTitle: section.title,
                body: evidenceBlock.content,
                evidenceType: evidenceBlock.evidenceType,
                evidenceLabel: evidenceBlock.evidenceLabel
            })

            chunks.push({
                pageTitle: title,
                sourceUrl,
                sectionTitle: section.title,
                chunkIndex,
                content,
                tokenCount: estimateTokenCount(content),
                evidenceType: evidenceBlock.evidenceType,
                evidenceLabel: evidenceBlock.evidenceLabel
            })
            chunkIndex += 1
        }

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

function chunkArray(values, size) {
    const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_IMPORT_BATCH_SIZE
    const chunks = []

    for (let index = 0; index < values.length; index += safeSize) {
        chunks.push(values.slice(index, index + safeSize))
    }

    return chunks
}

function formatEmbeddingForPgvector(embedding) {
    return `[${embedding.join(',')}]`
}

function normalizeEmbeddingResult(result) {
    if (Array.isArray(result)) {
        return {
            embeddings: result,
            promptTokens: null
        }
    }

    return {
        embeddings: result?.embeddings ?? [],
        promptTokens: Number.isFinite(result?.promptTokens) ? result.promptTokens : null
    }
}

function buildDocumentContent(page) {
    const header = [
        `Page Title: ${page.title}`,
        page.sourceUrl ? `Source URL: ${page.sourceUrl}` : null,
        page.crawledAt ? `Crawled At: ${page.crawledAt}` : null,
        page.corpusPath ? `Corpus Path: ${page.corpusPath}` : null
    ].filter(Boolean).join('\n')

    return `${header}\n\n${normalizeWhitespace(page.content)}`.trim()
}

function hostnameFromSourceUrl(sourceUrl) {
    try {
        return new URL(sourceUrl).hostname.replace(/^www\./, '')
    } catch {
        return ''
    }
}

function defaultCollectionName(pageChunks, crawlOutputDir) {
    const firstHost = pageChunks
        .map((entry) => hostnameFromSourceUrl(entry.page.sourceUrl))
        .find(Boolean)

    if (firstHost) return `Website Crawl - ${firstHost}`

    return `Website Crawl - ${path.basename(crawlOutputDir)}`
}

function knowledgeDocumentTypeForPage(page) {
    const sourceUrl = `${page?.sourceUrl ?? ''}`.trim()
    return /\.pdf(?:$|[?#])/i.test(sourceUrl) ? 'pdf' : 'article'
}

export async function buildCrawlCorpus(options = {}) {
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
    const pageChunks = []
    let totalChunks = 0
    const tokenCounts = []

    for (const page of pages) {
        const chunks = createWebsiteChunks(page, options)

        totalChunks += chunks.length
        tokenCounts.push(...chunks.map((chunk) => chunk.tokenCount))
        pageChunks.push({
            page,
            chunks
        })
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
        tokenSummary: numberSummary(tokenCounts),
        avgChunksPerPage: pageReports.length > 0 ? Number((totalChunks / pageReports.length).toFixed(2)) : 0,
        commonBoilerplateLines: commonBoilerplate.map((entry) => entry.line),
        commonBoilerplateLineSamples: commonBoilerplate.slice(0, 30),
        largestPages,
        sampleChunks,
        warnings: emptyPages.slice(0, 20).map((page) => `No chunks created for ${page.sourceUrl || page.corpusPath}`),
        pages: pageReports,
        pageChunks
    }
}

export async function buildDryRunReport(options = {}) {
    const corpus = await buildCrawlCorpus(options)

    return {
        ...corpus,
        dryRun: true,
        databaseWrites: 0
    }
}

function assertRepository(repository) {
    const requiredMethods = [
        'getOrganization',
        'findCollection',
        'createCollection',
        'deleteDocumentsByCollection',
        'insertDocuments',
        'insertChunks',
        'updateDocumentsStatus'
    ]

    for (const method of requiredMethods) {
        if (typeof repository?.[method] !== 'function') {
            throw new Error(`Import repository is missing ${method}`)
        }
    }
}

function isStatementTimeoutError(error) {
    const message = error instanceof Error ? error.message : String(error ?? '')
    return /statement timeout|canceling statement due to statement timeout/i.test(message)
}

async function insertChunkRowsWithBisect(repository, rows) {
    if (!Array.isArray(rows) || rows.length === 0) return

    try {
        await repository.insertChunks(rows)
    } catch (error) {
        if (rows.length === 1) {
            if (!isStatementTimeoutError(error)) throw error

            await repository.insertChunks(rows.map((row) => ({
                ...row,
                embedding: null
            })))
            return
        }

        const midpoint = Math.ceil(rows.length / 2)
        await insertChunkRowsWithBisect(repository, rows.slice(0, midpoint))
        await insertChunkRowsWithBisect(repository, rows.slice(midpoint))
    }
}

async function resolveImportCollection({ repository, organizationId, collectionName, replace }) {
    const existingCollection = await repository.findCollection({
        organizationId,
        name: collectionName
    })

    if (existingCollection && !replace) {
        throw new Error(`Collection "${collectionName}" already exists. Re-run with --replace to delete its previous documents first.`)
    }

    if (existingCollection) {
        await repository.deleteDocumentsByCollection({
            organizationId,
            collectionId: existingCollection.id
        })
        return existingCollection
    }

    return repository.createCollection({
        organization_id: organizationId,
        name: collectionName,
        description: 'Imported website crawl corpus for RAG answers.',
        icon: 'file-text'
    })
}

async function importPageBatch({
    batch,
    batchIndex,
    repository,
    organizationId,
    collectionId,
    language,
    embedTexts,
    embeddingBatchSize,
    chunkInsertBatchSize
}) {
    const documentRows = batch.map(({ page }) => ({
        organization_id: organizationId,
        collection_id: collectionId,
        title: page.title || 'Untitled page',
        type: knowledgeDocumentTypeForPage(page),
        source: 'website_crawl',
        content: buildDocumentContent(page),
        language: language || null,
        status: 'processing'
    }))

    const insertedDocuments = await repository.insertDocuments(documentRows)
    if (!Array.isArray(insertedDocuments) || insertedDocuments.length !== batch.length) {
        throw new Error(`Inserted document count mismatch for import batch ${batchIndex + 1}`)
    }

    const documentIds = insertedDocuments.map((document) => document.id)
    let chunksImported = 0
    let embeddingPromptTokens = 0
    let embeddingBatchCount = 0

    try {
        const pendingChunks = []
        batch.forEach((entry, pageIndex) => {
            const document = insertedDocuments[pageIndex]
            entry.chunks.forEach((chunk, chunkIndex) => {
                pendingChunks.push({
                    document_id: document.id,
                    organization_id: organizationId,
                    chunk_index: chunkIndex,
                    content: chunk.content,
                    token_count: chunk.tokenCount
                })
            })
        })

        for (const [embeddingBatchIndex, chunkBatch] of chunkArray(pendingChunks, embeddingBatchSize).entries()) {
            const embeddingResult = normalizeEmbeddingResult(await embedTexts(chunkBatch.map((chunk) => chunk.content), {
                batchIndex,
                embeddingBatchIndex
            }))
            if (embeddingResult.embeddings.length !== chunkBatch.length) {
                throw new Error(`Embedding count mismatch for import batch ${batchIndex + 1}.${embeddingBatchIndex + 1}`)
            }

            const rows = chunkBatch.map((chunk, index) => ({
                ...chunk,
                embedding: formatEmbeddingForPgvector(embeddingResult.embeddings[index] ?? [])
            }))
            for (const insertBatch of chunkArray(rows, chunkInsertBatchSize)) {
                await insertChunkRowsWithBisect(repository, insertBatch)
            }
            chunksImported += rows.length
            embeddingPromptTokens += embeddingResult.promptTokens
            embeddingBatchCount += 1
        }

        await repository.updateDocumentsStatus(documentIds, 'ready')

        return {
            pagesImported: batch.length,
            chunksImported,
            embeddingPromptTokens,
            embeddingBatchCount
        }
    } catch (error) {
        try {
            await repository.updateDocumentsStatus(documentIds, 'error')
        } catch {
            // Keep the original import error.
        }
        throw error
    }
}

export async function importCrawlCorpus(options = {}) {
    const organizationId = String(options.organizationId ?? '').trim()
    if (!organizationId) {
        throw new Error('organizationId is required for real import')
    }
    if (typeof options.embedTexts !== 'function') {
        throw new Error('embedTexts is required for real import')
    }

    const repository = options.repository
    assertRepository(repository)

    const organization = await repository.getOrganization(organizationId)
    if (!organization) {
        throw new Error(`Organization not found: ${organizationId}`)
    }

    const corpus = await buildCrawlCorpus(options)
    const importablePageChunks = corpus.pageChunks.filter((entry) => entry.chunks.length > 0)
    const collectionName = options.collectionName || defaultCollectionName(importablePageChunks, corpus.crawlOutputDir)
    const collection = await resolveImportCollection({
        repository,
        organizationId,
        collectionName,
        replace: Boolean(options.replace)
    })
    const batchSize = Number(options.batchSize ?? DEFAULT_IMPORT_BATCH_SIZE)
    const embeddingBatchSize = Number(options.embeddingBatchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE)
    const rawChunkInsertBatchSize = Number(options.chunkInsertBatchSize ?? DEFAULT_CHUNK_INSERT_BATCH_SIZE)
    const chunkInsertBatchSize = Number.isFinite(rawChunkInsertBatchSize) && rawChunkInsertBatchSize > 0
        ? Math.min(rawChunkInsertBatchSize, embeddingBatchSize)
        : Math.min(DEFAULT_CHUNK_INSERT_BATCH_SIZE, embeddingBatchSize)
    let pagesImported = 0
    let chunksImported = 0
    let usageRows = 0
    let embeddingPromptTokens = 0
    let embeddingBatchCount = 0

    for (const [batchIndex, batch] of chunkArray(importablePageChunks, batchSize).entries()) {
        const batchResult = await importPageBatch({
            batch,
            batchIndex,
            repository,
            organizationId,
            collectionId: collection.id,
            language: options.language,
            embedTexts: options.embedTexts,
            embeddingBatchSize,
            chunkInsertBatchSize
        })
        pagesImported += batchResult.pagesImported
        chunksImported += batchResult.chunksImported
        embeddingPromptTokens += batchResult.embeddingPromptTokens
        embeddingBatchCount += batchResult.embeddingBatchCount

        if (typeof options.onProgress === 'function') {
            options.onProgress({
                pagesImported,
                chunksImported,
                totalPages: importablePageChunks.length,
                totalChunks: corpus.totalChunks,
                collectionId: collection.id,
                collectionName
            })
        }
    }

    if (
        !options.skipUsage
        && embeddingPromptTokens > 0
        && typeof repository.recordEmbeddingUsage === 'function'
    ) {
        await repository.recordEmbeddingUsage({
            organization_id: organizationId,
            category: 'embedding',
            model: 'text-embedding-3-small',
            input_tokens: embeddingPromptTokens,
            output_tokens: 0,
            total_tokens: embeddingPromptTokens,
            metadata: {
                source: 'crawl_corpus_import',
                crawl_output_dir: corpus.crawlOutputDir,
                page_count: pagesImported,
                chunk_count: chunksImported,
                embedding_batch_count: embeddingBatchCount,
                usage_compaction: 'crawl_import_total'
            }
        })
        usageRows = 1
    }

    return {
        ...corpus,
        dryRun: false,
        organizationId,
        organizationName: organization.name ?? null,
        collectionId: collection.id,
        collectionName,
        replace: Boolean(options.replace),
        pagesImported,
        chunksImported,
        databaseWrites: pagesImported + chunksImported + usageRows
    }
}

function assertNoSupabaseError(result, action) {
    if (result?.error) {
        throw new Error(`${action}: ${result.error.message}`)
    }

    return result?.data ?? null
}

export function createSupabaseImportRepository(supabase) {
    return {
        async getOrganization(organizationId) {
            const result = await supabase
                .from('organizations')
                .select('id, name')
                .eq('id', organizationId)
                .maybeSingle()

            return assertNoSupabaseError(result, 'Failed to load organization')
        },
        async findCollection({ organizationId, name }) {
            const result = await supabase
                .from('knowledge_collections')
                .select('id, name')
                .eq('organization_id', organizationId)
                .eq('name', name)
                .maybeSingle()

            return assertNoSupabaseError(result, 'Failed to find collection')
        },
        async createCollection(row) {
            const result = await supabase
                .from('knowledge_collections')
                .insert(row)
                .select('id, name')
                .single()

            return assertNoSupabaseError(result, 'Failed to create collection')
        },
        async deleteDocumentsByCollection({ organizationId, collectionId }) {
            const deleteBatchSize = 25

            while (true) {
                const documentsResult = await supabase
                    .from('knowledge_documents')
                    .select('id')
                    .eq('organization_id', organizationId)
                    .eq('collection_id', collectionId)
                    .limit(deleteBatchSize)

                const documents = assertNoSupabaseError(documentsResult, 'Failed to list previous collection documents') ?? []
                const documentIds = documents.map((document) => document.id).filter(Boolean)
                if (documentIds.length === 0) break

                const chunkDeleteResult = await supabase
                    .from('knowledge_chunks')
                    .delete()
                    .eq('organization_id', organizationId)
                    .in('document_id', documentIds)

                assertNoSupabaseError(chunkDeleteResult, 'Failed to delete previous collection chunks')

                const documentDeleteResult = await supabase
                    .from('knowledge_documents')
                    .delete()
                    .eq('organization_id', organizationId)
                    .in('id', documentIds)

                assertNoSupabaseError(documentDeleteResult, 'Failed to delete previous collection documents')
            }
        },
        async insertDocuments(rows) {
            const result = await supabase
                .from('knowledge_documents')
                .insert(rows)
                .select('id, title')

            return assertNoSupabaseError(result, 'Failed to insert knowledge documents')
        },
        async insertChunks(rows) {
            const result = await supabase
                .from('knowledge_chunks')
                .insert(rows)

            assertNoSupabaseError(result, 'Failed to insert knowledge chunks')
        },
        async updateDocumentsStatus(documentIds, status) {
            if (documentIds.length === 0) return

            const result = await supabase
                .from('knowledge_documents')
                .update({ status })
                .in('id', documentIds)

            assertNoSupabaseError(result, `Failed to mark knowledge documents ${status}`)
        },
        async recordEmbeddingUsage(row) {
            const result = await supabase
                .from('organization_ai_usage')
                .insert(row)

            assertNoSupabaseError(result, 'Failed to record embedding usage')
        }
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
