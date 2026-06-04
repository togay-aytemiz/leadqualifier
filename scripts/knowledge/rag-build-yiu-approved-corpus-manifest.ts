import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

type Args = {
  websiteCorpus?: string
  websitePackagesDir?: string
  pdfManifest?: string
  out?: string
}

type WebsitePageInput = {
  localPath: string
  markdown: string
}

type ApprovedCorpusFile = {
  label: string
  localPath: string
  sourceUrl?: string
  sourcePage?: string
  sourceGroup?: string
  contentType: 'website_package' | 'approved_pdf'
  expectedTopics: string[]
}

type WebsiteSource = {
  title: string
  sourceUrl?: string
  localPath: string
  content: string
  sourceGroup: string
}

type WebsitePackageFile = ApprovedCorpusFile & {
  contentType: 'website_package'
  markdown: string
  sourceCount: number
}

type YiuLinkPdfManifest = {
  story?: string
  sourcePages?: string[]
  files?: Array<{
    label?: string
    localPath?: string
    sourceUrl?: string
    sourcePage?: string
    expectedTopics?: string[]
  }>
}

export type YiuApprovedCorpusManifest = {
  story: 'yiu-approved-corpus-pre-brochure'
  notes: string
  scope: {
    websiteCorpus: 'existing_crawl_without_pdf_source_pages'
    pdfCorpus: 'two_approved_yiu_pdf_pages'
    brochure: 'pending_customer_pdf'
  }
  sourcePages: string[]
  files: ApprovedCorpusFile[]
}

export function buildVectorStoreFileAttributes(input: {
  story: string
  label: string
  basename: string
  contentType?: string
  sourceGroup?: string
  sourceUrl?: string
}) {
  return {
    story: input.story.slice(0, 512),
    label: input.label.slice(0, 512),
    basename: input.basename.slice(0, 512),
    ...(input.contentType ? { content_type: input.contentType.slice(0, 512) } : {}),
    ...(input.sourceGroup ? { source_group: input.sourceGroup.slice(0, 512) } : {}),
    ...(input.sourceUrl ? { source_url: input.sourceUrl.slice(0, 512) } : {}),
  }
}

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
    else if (key === 'website-packages-dir') args.websitePackagesDir = value
    else if (key === 'pdf-manifest') args.pdfManifest = value
    else if (key === 'out') args.out = value
    else throw new Error(`Unknown argument --${key}`)
  }
  return args
}

function normalizePathForManifest(filePath: string) {
  return filePath.replace(/\\/g, '/')
}

function titleFromLocalPath(localPath: string) {
  return path
    .basename(localPath, path.extname(localPath))
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCrawlMarkdownMetadata(markdown: string, localPath: string) {
  const firstHeading = markdown.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim()
  const sourceUrl = markdown.match(/^Source URL:\s*(.+?)\s*$/m)?.[1]?.trim()
  const contentMatch = markdown.match(/(?:^|\n)## Content\s*\n([\s\S]*)$/)
  return {
    title: firstHeading || titleFromLocalPath(localPath),
    sourceUrl: sourceUrl || undefined,
    content: (contentMatch?.[1] ?? markdown).trim(),
  }
}

function isPdfUrl(value: string | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.pathname.toLocaleLowerCase('tr-TR').endsWith('.pdf')
  } catch {
    return value.toLocaleLowerCase('tr-TR').split('?')[0]?.endsWith('.pdf') ?? false
  }
}

function inferWebsiteSourceGroup(source: { sourceUrl?: string; localPath: string }) {
  const sourceUrl = source.sourceUrl?.toLocaleLowerCase('tr-TR') ?? ''
  const localPath = source.localPath.toLocaleLowerCase('tr-TR')
  const value = `${sourceUrl} ${localPath}`

  if (
    value.includes('aday-ogrenci') ||
    value.includes('landing') ||
    value.includes('sikca-sorulan') ||
    value.includes('akademik-takvim') ||
    value.includes('kayit') ||
    value.includes('kayıt') ||
    value.includes('ucret') ||
    value.includes('ücret') ||
    value.includes('burs') ||
    value.includes('indirim') ||
    value.includes('ogrenci-kabul') ||
    value.includes('öğrenci-kabul') ||
    value.includes('ozel-kosullar') ||
    value.includes('özel-kosullar')
  ) {
    return 'admissions'
  }
  if (value.includes('duyuru-') || value.includes('/duyuru/')) return 'announcements'
  if (value.includes('haber-') || value.includes('/haber/') || value.includes('haberler')) {
    return 'news'
  }
  if (value.includes('etkinlik-') || value.includes('/etkinlik/')) return 'events'
  if (value.includes('sayfa-akademik')) return 'academic'
  if (
    value.includes('iletisim') ||
    value.includes('iletişim') ||
    value.includes('daire-baskan') ||
    value.includes('koordinatorluk') ||
    value.includes('koordinatörlük')
  ) {
    return 'contact-admin'
  }
  if (value.includes('kurumsal') || value.includes('mevzuat') || value.includes('yonetim')) {
    return 'institutional'
  }
  return 'general'
}

function slugifyAscii(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function titleCaseGroup(value: string) {
  return value
    .split('-')
    .map((part) => part.slice(0, 1).toLocaleUpperCase('tr-TR') + part.slice(1))
    .join(' ')
}

function markdownByteLength(markdown: string) {
  return Buffer.byteLength(markdown, 'utf8')
}

function renderWebsitePackage(input: {
  label: string
  sourceGroup: string
  generatedAt: string
  sources: WebsiteSource[]
}) {
  const sourceIndex = input.sources
    .map((source, index) => {
      const urlPart = source.sourceUrl ? ` - ${source.sourceUrl}` : ''
      return `- [${index + 1}] ${source.title}${urlPart} - Local: ${source.localPath}`
    })
    .join('\n')

  const sourceBlocks = input.sources
    .map((source, index) =>
      [
        `## Source ${index + 1}: ${source.title}`,
        '',
        ...(source.sourceUrl ? [`Source URL: ${source.sourceUrl}`] : []),
        `Local Path: ${source.localPath}`,
        `Source Group: ${source.sourceGroup}`,
        '',
        source.content,
      ].join('\n')
    )
    .join('\n\n---\n\n')

  return [
    `# ${input.label}`,
    '',
    'Scope: Yüksek İhtisas Üniversitesi website crawl, PDF source URLs excluded.',
    `Source Group: ${input.sourceGroup}`,
    `Generated At: ${input.generatedAt}`,
    `Source Count: ${input.sources.length}`,
    '',
    '## Source Index',
    '',
    sourceIndex,
    '',
    sourceBlocks,
  ].join('\n')
}

export function buildWebsiteMarkdownPackages(input: {
  websitePages: WebsitePageInput[]
  outputDir: string
  generatedAt?: string
  maxPackageBytes?: number
}): WebsitePackageFile[] {
  const maxPackageBytes = Math.max(input.maxPackageBytes ?? 350_000, 10_000)
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const sources = input.websitePages
    .map((page): WebsiteSource | null => {
      const metadata = parseCrawlMarkdownMetadata(page.markdown, page.localPath)
      if (isPdfUrl(metadata.sourceUrl)) return null
      return {
        title: metadata.title,
        sourceUrl: metadata.sourceUrl,
        localPath: normalizePathForManifest(page.localPath),
        content: metadata.content,
        sourceGroup: inferWebsiteSourceGroup({
          sourceUrl: metadata.sourceUrl,
          localPath: page.localPath,
        }),
      }
    })
    .filter((source): source is WebsiteSource => source !== null)
    .sort((left, right) => {
      const groupCompare = left.sourceGroup.localeCompare(right.sourceGroup, 'tr')
      if (groupCompare !== 0) return groupCompare
      return left.localPath.localeCompare(right.localPath, 'tr')
    })

  const packages: WebsitePackageFile[] = []
  let currentGroup = ''
  let currentSources: WebsiteSource[] = []
  let currentPart = 1

  const flush = () => {
    if (currentSources.length === 0) return
    const groupLabel = titleCaseGroup(currentGroup)
    const label = `YİÜ Website - ${groupLabel} - ${String(currentPart).padStart(3, '0')}`
    const fileName = `yiu-website-${slugifyAscii(currentGroup)}-${String(currentPart).padStart(
      3,
      '0'
    )}.md`
    const markdown = renderWebsitePackage({
      label,
      sourceGroup: currentGroup,
      generatedAt,
      sources: currentSources,
    })
    packages.push({
      label,
      localPath: normalizePathForManifest(path.join(input.outputDir, fileName)),
      sourceGroup: currentGroup,
      contentType: 'website_package',
      expectedTopics: currentSources.map((source) => source.title),
      markdown,
      sourceCount: currentSources.length,
    })
    currentSources = []
    currentPart += 1
  }

  for (const source of sources) {
    if (source.sourceGroup !== currentGroup) {
      flush()
      currentGroup = source.sourceGroup
      currentPart = 1
    }

    currentSources.push(source)
    const draftLabel = `YİÜ Website - ${titleCaseGroup(currentGroup)} - ${String(
      currentPart
    ).padStart(3, '0')}`
    const draftMarkdown = renderWebsitePackage({
      label: draftLabel,
      sourceGroup: currentGroup,
      generatedAt,
      sources: currentSources,
    })
    if (currentSources.length > 1 && markdownByteLength(draftMarkdown) > maxPackageBytes) {
      const last = currentSources.pop()
      flush()
      if (last) currentSources.push(last)
    }
  }

  flush()
  return packages
}

export function buildYiuApprovedCorpusManifest(input: {
  websitePackages: WebsitePackageFile[]
  pdfManifest: YiuLinkPdfManifest
}): YiuApprovedCorpusManifest {
  const websiteFiles = input.websitePackages.map((file): ApprovedCorpusFile => ({
    label: file.label,
    localPath: file.localPath,
    sourceGroup: file.sourceGroup,
    contentType: 'website_package',
    expectedTopics: file.expectedTopics,
  }))

  const pdfFiles = (input.pdfManifest.files ?? []).map((file, index): ApprovedCorpusFile => {
    if (!file.label?.trim()) throw new Error(`PDF manifest file #${index + 1} requires label`)
    if (!file.localPath?.trim()) {
      throw new Error(`PDF manifest file #${index + 1} requires localPath`)
    }

    return {
      label: file.label.trim(),
      localPath: normalizePathForManifest(file.localPath.trim()),
      ...(file.sourceUrl?.trim() ? { sourceUrl: file.sourceUrl.trim() } : {}),
      ...(file.sourcePage?.trim() ? { sourcePage: file.sourcePage.trim() } : {}),
      contentType: 'approved_pdf',
      expectedTopics:
        file.expectedTopics?.map((topic) => topic.trim()).filter(Boolean) ?? [file.label.trim()],
    }
  })

  return {
    story: 'yiu-approved-corpus-pre-brochure',
    notes:
      'Pre-brochure approved YIU corpus: existing website crawl pages packaged into source-indexed markdown bundles with PDF source URLs excluded, plus PDFs from the two user-approved YIU mevzuat/yonergeler pages. Customer brochure PDF is pending.',
    scope: {
      websiteCorpus: 'existing_crawl_without_pdf_source_pages',
      pdfCorpus: 'two_approved_yiu_pdf_pages',
      brochure: 'pending_customer_pdf',
    },
    sourcePages: input.pdfManifest.sourcePages ?? [],
    files: [...websiteFiles, ...pdfFiles],
  }
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) return listMarkdownFiles(fullPath)
      if (entry.isFile() && entry.name.toLocaleLowerCase('tr-TR').endsWith('.md')) {
        return [fullPath]
      }
      return []
    })
  )
  return files.flat().sort((left, right) => left.localeCompare(right, 'tr'))
}

async function loadWebsitePages(corpusDir: string): Promise<WebsitePageInput[]> {
  const files = await listMarkdownFiles(corpusDir)
  return Promise.all(
    files.map(async (file) => ({
      localPath: normalizePathForManifest(path.relative(process.cwd(), file)),
      markdown: await readFile(file, 'utf8'),
    }))
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const websiteCorpus = path.resolve(
    args.websiteCorpus ?? path.join('tmp', 'crawl-output', 'yuksek-ihtisas', 'corpus')
  )
  const websitePackagesDir = path.resolve(
    args.websitePackagesDir ??
      path.join('tmp', 'rag-evals', 'yiu-approved-corpus', 'website-packages')
  )
  const pdfManifestPath = path.resolve(
    args.pdfManifest ?? path.join('tmp', 'rag-evals', 'yiu-link-pdfs', 'manifest.json')
  )
  const outputPath = path.resolve(
    args.out ?? path.join('tmp', 'rag-evals', 'yiu-approved-corpus', 'manifest.json')
  )

  const websitePages = await loadWebsitePages(websiteCorpus)
  const websitePackages = buildWebsiteMarkdownPackages({
    websitePages,
    outputDir: path.relative(process.cwd(), websitePackagesDir),
  })
  await mkdir(websitePackagesDir, { recursive: true })
  await Promise.all(
    websitePackages.map((file) =>
      writeFile(path.resolve(file.localPath), file.markdown, 'utf8')
    )
  )

  const pdfManifest = JSON.parse(await readFile(pdfManifestPath, 'utf8')) as YiuLinkPdfManifest
  const manifest = buildYiuApprovedCorpusManifest({ websitePackages, pdfManifest })

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(manifest, null, 2), 'utf8')

  console.log(
    `WEBSITE_PACKAGES ${manifest.files.filter((file) => file.contentType === 'website_package').length}`
  )
  console.log(
    `WEBSITE_SOURCES ${websitePackages.reduce((sum, file) => sum + file.sourceCount, 0)}`
  )
  console.log(`PDF_FILES ${manifest.files.filter((file) => file.contentType === 'approved_pdf').length}`)
  console.log(`TOTAL_FILES ${manifest.files.length}`)
  console.log(`MANIFEST ${outputPath}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error((error as Error).message)
    process.exitCode = 1
  })
}
