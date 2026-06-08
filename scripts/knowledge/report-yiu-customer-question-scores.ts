import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { analyzeCatalogCandidateGaps } from '@/lib/knowledge-base/rag-eval/catalog-candidate-generator'
import {
  applyRetestArtifacts,
  buildEffectiveEvaluationRows,
  parseCustomerEvaluationRows,
  summarizeScoreDistribution,
  type RetestArtifact,
} from '@/lib/knowledge-base/rag-eval/customer-question-score-report'

type Args = {
  doc?: string
  artifactsDir?: string
  score?: number
  withCandidates?: boolean
  maxCandidates?: number
  maxExamples?: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token?.startsWith('--')) continue
    const key = token.slice(2)
    if (key === 'with-candidates') {
      args.withCandidates = true
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
    index += 1
    if (key === 'doc') args.doc = value
    else if (key === 'artifacts-dir') args.artifactsDir = value
    else if (key === 'score') args.score = Number(value)
    else if (key === 'max-candidates') args.maxCandidates = Number(value)
    else if (key === 'max-examples') args.maxExamples = Number(value)
    else throw new Error(`Unknown argument --${key}`)
  }
  return args
}

async function loadRetestArtifacts(artifactsDir: string): Promise<RetestArtifact[]> {
  const names = await readdir(artifactsDir)
  const jsonNames = names
    .filter((name) => name.endsWith('.json') && name.includes('retest'))
    .sort()

  return Promise.all(
    jsonNames.map(async (filename) => ({
      filename,
      content: await readFile(path.join(artifactsDir, filename), 'utf8'),
    }))
  )
}

function printDistribution(distribution: Record<number, number>) {
  const total = Object.values(distribution).reduce((sum, count) => sum + count, 0)
  console.log('| Score /10 | Count | Share |')
  console.log('|---:|---:|---:|')
  for (const score of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const count = distribution[score] ?? 0
    const share = total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '0.0%'
    console.log(`| ${score} | ${count} | ${share} |`)
  }
  console.log(`| **Total** | **${total}** | **100.0%** |`)
}

function printCandidateAnalysis(
  analysis: ReturnType<typeof analyzeCatalogCandidateGaps>,
  options: { maxCandidates?: number } = {}
) {
  console.log('')
  console.log(`## Score-${analysis.targetScore} Catalog Candidate Analysis`)
  console.log('')
  console.log(`- Target rows: ${analysis.targetRows.length}`)
  console.log('')
  console.log('| Category | Count |')
  console.log('|---|---:|')
  for (const bucket of analysis.categoryBreakdown) {
    console.log(`| ${bucket.category} | ${bucket.count} |`)
  }

  const candidates = analysis.candidates.slice(0, options.maxCandidates ?? 20)
  console.log('')
  console.log('| Action | Category | Questions | Catalog slot | Missing fact | Required evidence | Examples |')
  console.log('|---|---|---:|---|---|---|---|')
  for (const candidate of candidates) {
    const examples = candidate.exampleQuestions.join('<br>')
    console.log(
      `| ${candidate.action} | ${candidate.category} | ${candidate.questionCount} | ${candidate.catalogSlot} | ${candidate.missingFact} | ${candidate.requiredEvidence} | ${examples} |`
    )
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const docPath =
    args.doc ?? 'docs/evaluations/yiu-demo-customer-questions-2026-06-05.md'
  const artifactsDir = args.artifactsDir ?? 'tmp/customer-question-batches'
  const rows = parseCustomerEvaluationRows(await readFile(path.resolve(docPath), 'utf8'))
  const artifacts = await loadRetestArtifacts(path.resolve(artifactsDir))
  const effectiveRows = applyRetestArtifacts(rows, artifacts)
  const distribution = summarizeScoreDistribution(effectiveRows)

  console.log(`# YİÜ Customer Question Effective Score Report`)
  console.log('')
  console.log(`- Evaluation rows: ${rows.length}`)
  console.log(`- Retest artifacts: ${artifacts.length}`)
  console.log('')
  printDistribution(distribution)

  if (args.withCandidates) {
    const effectiveRowsWithMetadata = buildEffectiveEvaluationRows(rows, artifacts)
    const analysis = analyzeCatalogCandidateGaps(effectiveRowsWithMetadata, {
      targetScore: Number.isFinite(args.score) ? args.score : 8,
      maxExamplesPerCandidate: Number.isFinite(args.maxExamples) ? args.maxExamples : 5,
    })
    printCandidateAnalysis(analysis, {
      maxCandidates: Number.isFinite(args.maxCandidates) ? args.maxCandidates : undefined,
    })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
