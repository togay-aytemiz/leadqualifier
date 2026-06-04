import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { RagStoryFileManifest } from '@/lib/knowledge-base/rag-eval/manifest'

type Args = {
  verified?: string
  baseManifest?: string
  out?: string
  brochureDir?: string
}

type BrochureCategory = {
  fileName: string
  label: string
  sourceGroup: string
  sections: string[]
  expectedTopics: string[]
}

export type BrochureCategoryFile = {
  label: string
  localPath: string
  sourceGroup: string
  contentType: 'brochure_verified_markdown'
  expectedTopics: string[]
  markdown: string
}

type BrochureManifest = Omit<RagStoryFileManifest, 'files'> & {
  scope: {
    websiteCorpus: 'existing_crawl_without_pdf_source_pages'
    pdfCorpus: 'two_approved_yiu_pdf_pages'
    brochure: 'verified_customer_brochure_markdown'
  }
  files: Array<RagStoryFileManifest['files'][number]>
}

const CATEGORIES: BrochureCategory[] = [
  {
    fileName: 'brochure-00-overview-contact.md',
    label: 'YİÜ Tanıtım Broşürü - Genel Tanıtım ve İletişim',
    sourceGroup: 'brochure-overview-contact',
    sections: ['Kapak', 'Tanıtım Metni', 'Yerleşke ve İletişim Bilgileri'],
    expectedTopics: [
      'Yüksek İhtisas Üniversitesi tanıtım metni',
      'telefon',
      'iletişim',
      'ulaşım bilgileri',
      'konaklama bilgileri',
      'QR bağlantıları',
    ],
  },
  {
    fileName: 'brochure-01-tip.md',
    label: 'YİÜ Tanıtım Broşürü - Tıp Fakültesi Kontenjan ve Ücretler',
    sourceGroup: 'brochure-program-fee-tip',
    sections: ['Tıp Fakültesi 2025 Kontenjan ve Fiyat Tablosu'],
    expectedTopics: [
      'Tıp Fakültesi',
      'Tıp Fakültesi İngilizce',
      'Tıp Fakültesi hazırlık',
      'kontenjan',
      'fiyat',
      'taban puan',
      'başarı sırası',
    ],
  },
  {
    fileName: 'brochure-02-saglik-bilimleri.md',
    label: 'YİÜ Tanıtım Broşürü - Sağlık Bilimleri Fakültesi Kontenjan ve Ücretler',
    sourceGroup: 'brochure-program-fee-saglik-bilimleri',
    sections: ['Sağlık Bilimleri Fakültesi 2025 Kontenjan ve Fiyat Tablosu'],
    expectedTopics: [
      'Beslenme ve Diyetetik',
      'Dil ve Konuşma Terapisi',
      'Fizyoterapi ve Rehabilitasyon',
      'Hemşirelik',
      'Sağlık Yönetimi',
      'Ergoterapi',
      'Ebelik',
      'kontenjan',
      'fiyat',
      'taban puan',
    ],
  },
  {
    fileName: 'brochure-03-spor.md',
    label: 'YİÜ Tanıtım Broşürü - Spor Bilimleri Fakültesi Kontenjan ve Ücretler',
    sourceGroup: 'brochure-program-fee-spor',
    sections: ['Spor Bilimleri Fakültesi 2025 Kontenjan ve Fiyat Tablosu'],
    expectedTopics: ['Antrenörlük Eğitimi', 'kontenjan', 'fiyat', 'TYT'],
  },
  {
    fileName: 'brochure-04-shmyo.md',
    label:
      'YİÜ Tanıtım Broşürü - Sağlık Hizmetleri Meslek Yüksekokulu Kontenjan ve Ücretler',
    sourceGroup: 'brochure-program-fee-shmyo',
    sections: [
      'Kontrol Gerektiren Kaynak Tutarsızlığı',
      'Sağlık Hizmetleri Meslek Yüksekokulu 2025 Kontenjan ve Fiyat Tablosu',
    ],
    expectedTopics: [
      'Ameliyathane Hizmetleri',
      'Anestezi',
      'Biyomedikal Cihaz Teknolojisi',
      'Elektronörofizyoloji',
      'Optisyenlik',
      'Tıbbi Dokümantasyon ve Sekreterlik',
      'Tıbbi Laboratuvar Teknikleri',
      'Tıbbi Tanıtım ve Pazarlama',
      'Fizyoterapi',
      'İlk ve Acil Yardım',
      'Tele-Sağlık Teknikerliği',
      'Tıbbi Veri İşleme Teknikerliği',
    ],
  },
  {
    fileName: 'brochure-05-myo.md',
    label: 'YİÜ Tanıtım Broşürü - Meslek Yüksekokulu Kontenjan ve Ücretler',
    sourceGroup: 'brochure-program-fee-myo',
    sections: ['Meslek Yüksekokulu 2025 Kontenjan ve Fiyat Tablosu'],
    expectedTopics: [
      'Bilgisayar Programcılığı',
      'Eczane Hizmetleri',
      'Elektrik',
      'Grafik Tasarım',
      'kontenjan',
      'fiyat',
      'taban puan',
    ],
  },
  {
    fileName: 'brochure-06-burs-cift-anadal.md',
    label: 'YİÜ Tanıtım Broşürü - Burslar ve Çift Anadal',
    sourceGroup: 'brochure-scholarship-double-major',
    sections: ['Çift Anadal Programı', 'Burs İmkanları'],
    expectedTopics: [
      'Çift Anadal Programı',
      'YKS Üstün Başarı Bursu',
      'Tercih Bursu',
      'Akademik Başarı Bursu',
      'Şehit ve Gazi Çocukları Bursu',
      'Kardeş Bursu',
      'Spor Başarı Bursu',
      'Sosyal Destek Bursu',
    ],
  },
  {
    fileName: 'brochure-07-campus-program-map.md',
    label: 'YİÜ Tanıtım Broşürü - Program ve Yerleşke Eşleşmeleri',
    sourceGroup: 'brochure-campus-program-map',
    sections: ['Fakülte, Program ve Yerleşke Eşleşmeleri', 'Program Listeleri'],
    expectedTopics: [
      '100. Yıl Yerleşkesi',
      'Bağlıca Yerleşkesi',
      'Balgat Yerleşkesi',
      'Bağlum Yerleşkesi',
      'program listeleri',
      'fakülte yerleşke',
    ],
  },
]

function parseArgs(argv: string[]): Args {
  const args: Args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token?.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
    index += 1
    if (key === 'verified') args.verified = value
    else if (key === 'base-manifest') args.baseManifest = value
    else if (key === 'out') args.out = value
    else if (key === 'brochure-dir') args.brochureDir = value
    else throw new Error(`Unknown argument --${key}`)
  }
  return args
}

function normalizePathForManifest(filePath: string) {
  return filePath.replace(/\\/g, '/')
}

function splitH2Sections(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const sections = new Map<string, string>()
  let currentTitle: string | null = null
  let currentLines: string[] = []

  const flush = () => {
    if (!currentTitle) return
    sections.set(currentTitle, currentLines.join('\n').trim())
  }

  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/)
    if (match) {
      flush()
      currentTitle = match[1]!.trim()
      currentLines = [line]
      continue
    }
    if (currentTitle) currentLines.push(line)
  }
  flush()

  return sections
}

function buildCategoryMarkdown(input: {
  label: string
  sourceGroup: string
  sectionMarkdown: string[]
  generatedAt: string
}) {
  return [
    `# ${input.label}`,
    '',
    'Kaynak: Yüksek İhtisas Üniversitesi tanıtım broşürü.',
    'Kaynak türü: Doğrulanmış broşür markdown çıkarımı.',
    `Kategori: ${input.sourceGroup}`,
    `Hazırlama tarihi: ${input.generatedAt}`,
    '',
    ...input.sectionMarkdown,
    '',
  ].join('\n')
}

export function buildCategorizedBrochureMarkdownFiles(input: {
  verifiedMarkdown: string
  outputDir: string
  generatedAt?: string
}): BrochureCategoryFile[] {
  const sections = splitH2Sections(input.verifiedMarkdown)
  const generatedAt = input.generatedAt ?? new Date().toISOString()

  return CATEGORIES.map((category) => {
    const sectionMarkdown = category.sections.map((sectionTitle) => {
      const section = sections.get(sectionTitle)
      if (!section) throw new Error(`Verified brochure markdown is missing section: ${sectionTitle}`)
      return section
    })

    return {
      label: category.label,
      localPath: normalizePathForManifest(path.join(input.outputDir, category.fileName)),
      sourceGroup: category.sourceGroup,
      contentType: 'brochure_verified_markdown',
      expectedTopics: category.expectedTopics,
      markdown: buildCategoryMarkdown({
        label: category.label,
        sourceGroup: category.sourceGroup,
        sectionMarkdown,
        generatedAt,
      }),
    }
  })
}

export function buildYiuBrochureApprovedCorpusManifest(input: {
  baseManifest: RagStoryFileManifest
  brochureFiles: BrochureCategoryFile[]
}): BrochureManifest {
  return {
    story: 'yiu-tanitim-gunleri-2026-approved-corpus',
    notes:
      'Approved YIU admissions corpus with existing non-PDF website crawl packages, two approved YIU PDF source pages, and categorized verified brochure markdown extracted from the customer brochure PDF.',
    scope: {
      websiteCorpus: 'existing_crawl_without_pdf_source_pages',
      pdfCorpus: 'two_approved_yiu_pdf_pages',
      brochure: 'verified_customer_brochure_markdown',
    },
    files: [
      ...input.baseManifest.files,
      ...input.brochureFiles.map((file) => ({
        label: file.label,
        localPath: file.localPath,
        sourceGroup: file.sourceGroup,
        contentType: file.contentType,
        expectedTopics: file.expectedTopics,
      })),
    ],
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const verifiedPath = path.resolve(
    args.verified ??
      path.join('tmp', 'rag-evals', 'yiu-brochure', 'yiu-admissions-brochure-verified.md')
  )
  const baseManifestPath = path.resolve(
    args.baseManifest ?? path.join('tmp', 'rag-evals', 'yiu-approved-corpus', 'manifest.json')
  )
  const brochureDir = path.resolve(
    args.brochureDir ?? path.join('tmp', 'rag-evals', 'yiu-approved-corpus', 'brochure-packages')
  )
  const outputPath = path.resolve(
    args.out ?? path.join('tmp', 'rag-evals', 'yiu-approved-corpus', 'manifest-with-brochure.json')
  )

  const verifiedMarkdown = await readFile(verifiedPath, 'utf8')
  const brochureFiles = buildCategorizedBrochureMarkdownFiles({
    verifiedMarkdown,
    outputDir: path.relative(process.cwd(), brochureDir),
  })

  await mkdir(brochureDir, { recursive: true })
  await Promise.all(
    brochureFiles.map((file) => writeFile(path.resolve(file.localPath), file.markdown, 'utf8'))
  )

  const baseManifest = JSON.parse(await readFile(baseManifestPath, 'utf8')) as RagStoryFileManifest
  const manifest = buildYiuBrochureApprovedCorpusManifest({ baseManifest, brochureFiles })

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(manifest, null, 2), 'utf8')

  console.log(`BASE_FILES ${baseManifest.files.length}`)
  console.log(`BROCHURE_FILES ${brochureFiles.length}`)
  console.log(`TOTAL_FILES ${manifest.files.length}`)
  console.log(`BROCHURE_DIR ${brochureDir}`)
  console.log(`MANIFEST ${outputPath}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error((error as Error).message)
    process.exitCode = 1
  })
}
