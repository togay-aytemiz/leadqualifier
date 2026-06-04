import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type Args = {
  out?: string
  manifest?: string
}

type PdfLink = {
  label: string
  url: string
  sourcePage: string
  localPath: string
}

const SOURCE_PAGES = [
  'https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/kurumsal-bilgiler/mevzuat',
  'https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/mevzuatlar/yonergeler',
]

const GLOBAL_NON_BENCHMARK_LABELS = new Set([
  'çalışan aydınlatma metni',
  '2024-2028 stratejik planı',
  'organizasyon şeması',
])

function parseArgs(argv: string[]): Args {
  const args: Args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token?.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
    index += 1
    if (key === 'out') args.out = value
    else if (key === 'manifest') args.manifest = value
    else throw new Error(`Unknown argument --${key}`)
  }
  return args
}

function htmlText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function pageContent(html: string) {
  const sectionMatch = html.match(
    /<section\b[^>]*class=["'][^"']*page-content[^"']*["'][^>]*>([\s\S]*?)<\/section>/i
  )
  return sectionMatch?.[1] ?? html
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
}

function extractPdfLinks(html: string, sourcePage: string) {
  const body = pageContent(html)
  const links: Array<{ label: string; url: string; sourcePage: string }> = []
  const anchorPattern = /<a\b([^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*)>([\s\S]*?)<\/a>/gi

  for (const match of body.matchAll(anchorPattern)) {
    const attributes = match[1] ?? ''
    if (sourcePage.includes('/tip-fakultesi/') && !/\bfile-blocks\b/i.test(attributes)) continue
    const rawHref = match[2]
    const rawInner = match[3] ?? ''
    if (!rawHref) continue
    const url = new URL(rawHref.replace('/siyah/../', '/'), sourcePage).href
    const label = htmlText(rawInner) || path.basename(new URL(url).pathname)
    if (GLOBAL_NON_BENCHMARK_LABELS.has(label.toLocaleLowerCase('tr-TR'))) continue
    links.push({ label, url, sourcePage })
  }

  return links
}

function dedupeLinks(links: Array<{ label: string; url: string; sourcePage: string }>) {
  const byUrl = new Map<string, { label: string; url: string; sourcePage: string }>()
  for (const link of links) {
    if (!byUrl.has(link.url)) byUrl.set(link.url, link)
  }
  return [...byUrl.values()]
}

async function downloadPdf(
  link: { label: string; url: string; sourcePage: string },
  outDir: string,
  index: number
) {
  const response = await fetch(link.url)
  if (!response.ok) throw new Error(`Failed to download ${link.url}: ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const fileName = `${String(index + 1).padStart(3, '0')}-${slugify(link.label) || 'document'}.pdf`
  const localPath = path.join(outDir, fileName)
  await writeFile(localPath, bytes)
  return {
    ...link,
    localPath,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outputRoot = path.resolve(args.out ?? path.join('tmp', 'rag-evals', 'yiu-link-pdfs'))
  const filesDir = path.join(outputRoot, 'files')
  await mkdir(filesDir, { recursive: true })

  const allLinks = []
  for (const sourcePage of SOURCE_PAGES) {
    const response = await fetch(sourcePage)
    if (!response.ok) throw new Error(`Failed to fetch ${sourcePage}: ${response.status}`)
    allLinks.push(...extractPdfLinks(await response.text(), sourcePage))
  }

  const links = dedupeLinks(allLinks)
  const downloaded: PdfLink[] = []
  for (let index = 0; index < links.length; index += 1) {
    const link = links[index]!
    const file = await downloadPdf(link, filesDir, index)
    downloaded.push(file)
    console.log(`PDF ${index + 1}/${links.length} ${file.label}`)
  }

  const manifest = {
    story: 'yiu-link-pdfs',
    notes:
      'PDFs downloaded from the two user-approved Yüksek İhtisas Üniversitesi mevzuat/yönergeler pages. Global menu PDFs are excluded by parsing only page-content sections.',
    sourcePages: SOURCE_PAGES,
    files: downloaded.map((file) => ({
      label: file.label,
      localPath: path.relative(process.cwd(), file.localPath),
      sourceUrl: file.url,
      sourcePage: file.sourcePage,
      expectedTopics: [file.label],
    })),
  }

  const manifestPath = path.resolve(args.manifest ?? path.join(outputRoot, 'manifest.json'))
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  await writeFile(
    path.join(outputRoot, 'pdf-links.json'),
    JSON.stringify(downloaded, null, 2),
    'utf8'
  )

  console.log(`COUNT ${downloaded.length}`)
  console.log(`MANIFEST ${manifestPath}`)
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
