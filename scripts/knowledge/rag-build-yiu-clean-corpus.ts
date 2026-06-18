import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

type Args = {
  websiteCorpus?: string
  approvedManifest?: string
  outputDir?: string
}

export type WebsiteSource = {
  title: string
  sourceUrl?: string
  content: string
  localPath: string
}

export type CorpusDecision = {
  keep: boolean
  reason:
    | 'durable_page'
    | 'approved_root_page'
    | 'transient_history'
    | 'listing_page'
    | 'navigation_only'
    | 'unsupported_route'
}

export type CleanCorpusManifestFile = {
  label: string
  localPath: string
  sourceUrl?: string
  sourcePage?: string
  sourceGroup?: string
  contentType: string
  expectedTopics: string[]
}

type FileDigest = { sha256: string; sizeBytes: number }

type ApprovedManifest = {
  story?: string
  sourcePages?: string[]
  files?: CleanCorpusManifestFile[]
}

const APPROVED_ROOT_PATHS = new Set([
  '/aday-ogrenci',
  '/akademik-takvim',
  '/iletisim',
  '/landing',
  '/mezun-bilgi-sistemi',
  '/obs',
  '/ozel-kosullar',
  '/sikca-sorulan-sorular',
])

const APPROVED_ROOT_PREFIXES = ['/arastirma-merkezleri']
const NAVIGATION_ONLY_TEXT =
  'introduction video fees and scholarships frequently asked questions clarification text'

function parseArgs(argv: string[]): Args {
  const args: Args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token?.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
    index += 1
    if (key === 'website-corpus') args.websiteCorpus = value
    else if (key === 'approved-manifest') args.approvedManifest = value
    else if (key === 'output-dir') args.outputDir = value
    else throw new Error(`Unknown argument --${key}`)
  }
  return args
}

function normalizeText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function urlPathname(value: string | undefined) {
  if (!value) return ''
  try {
    const pathname = new URL(value).pathname.replace(/\/+$/, '')
    return pathname || '/'
  } catch {
    return ''
  }
}

export function selectWebsiteSource(source: WebsiteSource): CorpusDecision {
  const pathname = urlPathname(source.sourceUrl).toLocaleLowerCase('tr-TR')
  const normalizedContent = normalizeText(source.content)

  if (
    /\/(duyurular|haberler|etkinlikler)\/index(?:\/|$)/.test(pathname) ||
    /\/(duyurular|haberler|etkinlikler)$/.test(pathname)
  ) {
    return { keep: false, reason: 'listing_page' }
  }
  if (/\/(duyuru|haber|etkinlik)(?:\/|$)/.test(pathname)) {
    return { keep: false, reason: 'transient_history' }
  }
  if (!normalizedContent || normalizedContent === NAVIGATION_ONLY_TEXT) {
    return { keep: false, reason: 'navigation_only' }
  }
  const normalizedTitle = normalizeText(source.title)
  const contentWithoutRepeatedTitle = normalizedContent
    .replaceAll(normalizedTitle, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (contentWithoutRepeatedTitle.split(/\s+/).filter(Boolean).length < 5) {
    return { keep: false, reason: 'navigation_only' }
  }
  if (pathname.startsWith('/sayfa/')) return { keep: true, reason: 'durable_page' }
  if (
    APPROVED_ROOT_PATHS.has(pathname) ||
    APPROVED_ROOT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return { keep: true, reason: 'approved_root_page' }
  }
  return { keep: false, reason: 'unsupported_route' }
}

function pdfPreference(file: CleanCorpusManifestFile) {
  const source = `${file.sourceUrl ?? ''} ${file.sourcePage ?? ''}`
  if (source.includes('/Uploads/akademik_view/')) return 2
  if (source.includes('/sayfa/akademik/fakulteler/')) return 1
  return 0
}

async function defaultFileDigest(filePath: string): Promise<FileDigest> {
  const bytes = await readFile(path.resolve(filePath))
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  }
}

export async function deduplicateApprovedFiles(
  files: CleanCorpusManifestFile[],
  digestFile: (filePath: string) => Promise<FileDigest> = defaultFileDigest
) {
  const groups = new Map<string, Array<{ file: CleanCorpusManifestFile; digest: FileDigest }>>()
  for (const file of files) {
    const digest = await digestFile(file.localPath)
    const group = groups.get(digest.sha256) ?? []
    group.push({ file, digest })
    groups.set(digest.sha256, group)
  }

  const retained = new Set<CleanCorpusManifestFile>()
  const duplicates: Array<{
    sha256: string
    sizeBytes: number
    kept: string
    removed: string
  }> = []

  for (const [sha256, group] of groups) {
    const ranked = [...group].sort(
      (left, right) =>
        pdfPreference(right.file) - pdfPreference(left.file) ||
        left.file.localPath.localeCompare(right.file.localPath, 'tr')
    )
    const winner = ranked[0]!
    retained.add(winner.file)
    for (const duplicate of ranked.slice(1)) {
      duplicates.push({
        sha256,
        sizeBytes: duplicate.digest.sizeBytes,
        kept: winner.file.localPath,
        removed: duplicate.file.localPath,
      })
    }
  }

  return {
    files: files.filter((file) => retained.has(file)),
    duplicates,
  }
}

function parseCrawlMarkdown(markdown: string, localPath: string): WebsiteSource {
  const title = markdown.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() || path.basename(localPath, '.md')
  const sourceUrl = markdown.match(/^Source URL:\s*(.+?)\s*$/m)?.[1]?.trim()
  const content = markdown.match(/(?:^|\n)## Content\s*\n([\s\S]*)$/)?.[1]?.trim() ?? markdown.trim()
  return { title, sourceUrl, content, localPath }
}

function slugifyAscii(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
}

function renderWebsiteSource(source: WebsiteSource) {
  return [
    `# ${source.title}`,
    '',
    ...(source.sourceUrl ? [`Kaynak adresi: ${source.sourceUrl}`, ''] : []),
    source.content,
    '',
  ].join('\n')
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) return listMarkdownFiles(fullPath)
      return entry.isFile() && entry.name.toLocaleLowerCase('tr-TR').endsWith('.md')
        ? [fullPath]
        : []
    })
  )
  return nested.flat().sort((left, right) => left.localeCompare(right, 'tr'))
}

function inferSourceGroup(sourceUrl: string | undefined) {
  const pathname = urlPathname(sourceUrl)
  if (pathname.includes('/akademik/')) return 'academic'
  if (pathname.includes('/kurumsal/')) return 'institutional'
  if (pathname.includes('/ogrenci/')) return 'student'
  if (pathname.includes('iletisim')) return 'contact'
  if (pathname.includes('aday-ogrenci') || pathname.includes('ozel-kosullar')) return 'admissions'
  return 'website'
}

function manifestPath(value: string) {
  return value.replace(/\\/g, '/')
}

export async function buildYiuCleanCorpus(input: {
  websiteCorpus: string
  approvedManifest: ApprovedManifest
  outputDir: string
}) {
  const websiteOutputDir = path.join(input.outputDir, 'website-pages')
  await rm(websiteOutputDir, { recursive: true, force: true })
  await mkdir(websiteOutputDir, { recursive: true })

  const decisions: Array<WebsiteSource & CorpusDecision> = []
  const retainedByContent = new Map<string, WebsiteSource>()
  for (const filePath of await listMarkdownFiles(input.websiteCorpus)) {
    const source = parseCrawlMarkdown(await readFile(filePath, 'utf8'), filePath)
    const decision = selectWebsiteSource(source)
    decisions.push({ ...source, ...decision })
    if (!decision.keep) continue
    const contentKey = createHash('sha256').update(normalizeText(source.content)).digest('hex')
    if (!retainedByContent.has(contentKey)) retainedByContent.set(contentKey, source)
  }

  const websiteFiles: CleanCorpusManifestFile[] = []
  const outputHashes: Array<{ localPath: string; sha256: string; sizeBytes: number }> = []
  let index = 0
  for (const source of [...retainedByContent.values()].sort((left, right) =>
    (left.sourceUrl ?? left.localPath).localeCompare(right.sourceUrl ?? right.localPath, 'tr')
  )) {
    index += 1
    const markdown = renderWebsiteSource(source)
    const shortHash = createHash('sha256').update(source.sourceUrl ?? source.localPath).digest('hex').slice(0, 10)
    const fileName = `${String(index).padStart(4, '0')}-${slugifyAscii(source.title) || 'sayfa'}-${shortHash}.md`
    const outputPath = path.join(websiteOutputDir, fileName)
    await writeFile(outputPath, markdown, 'utf8')
    const digest = await defaultFileDigest(outputPath)
    const localPath = manifestPath(path.relative(process.cwd(), outputPath))
    outputHashes.push({ localPath, ...digest })
    websiteFiles.push({
      label: `YİÜ Web - ${source.title}`,
      localPath,
      ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
      sourceGroup: inferSourceGroup(source.sourceUrl),
      contentType: 'website_page',
      expectedTopics: [source.title],
    })
  }

  const approvedFiles = input.approvedManifest.files ?? []
  const pdfFiles = approvedFiles.filter((file) => file.contentType === 'approved_pdf')
  const nonPdfFiles = approvedFiles.filter(
    (file) => file.contentType !== 'approved_pdf' && file.contentType !== 'website_package'
  )
  const deduplicated = await deduplicateApprovedFiles(pdfFiles)
  const files = [...websiteFiles, ...deduplicated.files, ...nonPdfFiles]

  const exclusionCounts = decisions.reduce<Record<string, number>>((counts, decision) => {
    if (!decision.keep) counts[decision.reason] = (counts[decision.reason] ?? 0) + 1
    return counts
  }, {})
  const manifest = {
    story: 'yiu-tanitim-gunleri-2026-clean-corpus',
    notes:
      'Clean YIU corpus: durable source-level website pages, exact-deduplicated approved PDFs, and visually verified brochure packages.',
    sourcePages: input.approvedManifest.sourcePages ?? [],
    files,
  }
  const audit = {
    generatedAt: new Date().toISOString(),
    websiteInputCount: decisions.length,
    websiteRetainedCount: websiteFiles.length,
    websiteDuplicateContentCount:
      decisions.filter((decision) => decision.keep).length - websiteFiles.length,
    websiteExclusions: exclusionCounts,
    approvedPdfInputCount: pdfFiles.length,
    approvedPdfRetainedCount: deduplicated.files.length,
    brochureFileCount: nonPdfFiles.filter((file) => file.contentType === 'brochure_verified_markdown').length,
    exactPdfDuplicates: deduplicated.duplicates,
    totalOutputFiles: files.length,
    websiteOutputHashes: outputHashes,
  }

  await writeFile(path.join(input.outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  await writeFile(path.join(input.outputDir, 'audit.json'), JSON.stringify(audit, null, 2), 'utf8')
  await writeFile(
    path.join(input.outputDir, 'audit.md'),
    [
      '# YİÜ Clean Corpus Audit',
      '',
      `- Website input: ${audit.websiteInputCount}`,
      `- Website retained: ${audit.websiteRetainedCount}`,
      `- Website duplicate bodies removed: ${audit.websiteDuplicateContentCount}`,
      `- Approved PDFs: ${audit.approvedPdfRetainedCount}/${audit.approvedPdfInputCount}`,
      `- Exact PDF duplicates removed: ${audit.exactPdfDuplicates.length}`,
      `- Verified brochure files: ${audit.brochureFileCount}`,
      `- Total output files: ${audit.totalOutputFiles}`,
      '',
      '## Website Exclusions',
      '',
      ...Object.entries(audit.websiteExclusions)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([reason, count]) => `- ${reason}: ${count}`),
      '',
    ].join('\n'),
    'utf8'
  )

  return { manifest, audit }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const websiteCorpus = path.resolve(
    args.websiteCorpus ?? path.join('tmp', 'crawl-output', 'yuksek-ihtisas', 'corpus')
  )
  const approvedManifestPath = path.resolve(
    args.approvedManifest ??
      path.join('tmp', 'rag-evals', 'yiu-approved-corpus', 'manifest-with-brochure.json')
  )
  const outputDir = path.resolve(
    args.outputDir ?? path.join('tmp', 'rag-evals', 'yiu-clean-corpus')
  )
  const approvedManifest = JSON.parse(await readFile(approvedManifestPath, 'utf8')) as ApprovedManifest
  const result = await buildYiuCleanCorpus({ websiteCorpus, approvedManifest, outputDir })
  console.log(`WEBSITE_RETAINED ${result.audit.websiteRetainedCount}`)
  console.log(`PDF_RETAINED ${result.audit.approvedPdfRetainedCount}`)
  console.log(`BROCHURE_FILES ${result.audit.brochureFileCount}`)
  console.log(`TOTAL_FILES ${result.audit.totalOutputFiles}`)
  console.log(`MANIFEST ${path.join(outputDir, 'manifest.json')}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error((error as Error).message)
    process.exitCode = 1
  })
}
