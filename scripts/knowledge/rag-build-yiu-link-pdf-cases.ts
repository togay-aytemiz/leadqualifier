import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'
import type { RagEvalCase } from '@/lib/knowledge-base/rag-eval/types'

type Args = {
  manifest?: string
  out?: string
  limit?: string
}

type SourceQaCase = {
  question: string
  sourceTitles: string[]
  mustContain?: string[]
  anyOf?: string[][]
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
    if (key === 'manifest') args.manifest = value
    else if (key === 'out') args.out = value
    else if (key === 'limit') args.limit = value
    else throw new Error(`Unknown argument --${key}`)
  }
  return args
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function caseSourceMatchesManifest(testCase: SourceQaCase, manifestLabels: string[]) {
  return testCase.sourceTitles.some((sourceTitle) => {
    const source = normalize(sourceTitle)
    return manifestLabels.some((label) => {
      const normalizedLabel = normalize(label)
      return normalizedLabel.includes(source) || source.includes(normalizedLabel)
    })
  })
}

function extractQaCases(source: string): SourceQaCase[] {
  const match = source.match(
    /const QA_CASES: QaCase\[] = (\[[\s\S]*?\])\n\nfunction selectedQaCases/
  )
  if (!match?.[1]) throw new Error('Could not extract QA_CASES from live mevzuat script')
  return vm.runInNewContext(match[1]) as SourceQaCase[]
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifestPath = path.resolve(
    args.manifest ?? path.join('tmp', 'rag-evals', 'yiu-link-pdfs', 'manifest.json')
  )
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    files?: Array<{ label?: string }>
  }
  const manifestLabels = (manifest.files ?? [])
    .map((file) => file.label)
    .filter((label): label is string => typeof label === 'string' && label.trim().length > 0)

  const sourceScript = await readFile(
    path.join(process.cwd(), 'scripts', 'knowledge', 'qa-live-yiu-mevzuat-pipeline.ts'),
    'utf8'
  )
  const sourceCases = extractQaCases(sourceScript)
  const limit = Number.parseInt(args.limit ?? '50', 10)
  const filtered = sourceCases
    .filter((testCase) => caseSourceMatchesManifest(testCase, manifestLabels))
    .slice(0, Number.isFinite(limit) ? limit : 50)

  if (filtered.length === 0) throw new Error('No QA cases matched downloaded PDF manifest labels')

  const cases: RagEvalCase[] = filtered.map((testCase, index) => ({
    id: `yiu-link-pdf-${String(index + 1).padStart(2, '0')}`,
    question: testCase.question,
    language: 'tr',
    category: 'yiu_link_pdf',
    expectedAnswerTerms: testCase.mustContain ?? [],
    expectedAnyAnswerTermGroups: testCase.anyOf ?? [],
    expectedSourceTerms: testCase.sourceTitles.length === 1 ? testCase.sourceTitles : [],
    expectedAnySourceTermGroups: testCase.sourceTitles.length > 1 ? [testCase.sourceTitles] : [],
  }))

  const outPath = path.resolve(
    args.out ?? path.join('tmp', 'rag-evals', 'yiu-link-pdfs', 'cases.json')
  )
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(cases, null, 2), 'utf8')

  console.log(`CASES ${cases.length}`)
  console.log(`OUTPUT ${outPath}`)
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
