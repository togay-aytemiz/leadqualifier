export type CustomerEvaluationRow = {
  no: number
  question: string
  originalScore: number
  score: number
}

export type RetestEntryMetadata = {
  artifactFilename: string
  answer?: string
  classification?: string
  refusal?: boolean
  suggestedScore?: number
  strictVerdict?: string
  strictQuality?: {
    suggestedScore?: number
    tier?: string
    reason?: string
  }
  citationCount: number
}

export type CustomerEffectiveEvaluationRow = CustomerEvaluationRow & {
  latestRetest?: RetestEntryMetadata
}

export type RetestArtifact = {
  filename: string
  content: string
}

type RetestEntry = {
  row?: {
    no?: unknown
  }
  result?: {
    answer?: unknown
    refusal?: unknown
    citations?: unknown
    diagnostics?: {
      strictVerdict?: unknown
      strictQuality?: unknown
    }
  }
  suggestedScore?: unknown
  classification?: unknown
}

const SCORE_BUCKETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

function evaluationTableContent(markdown: string) {
  const start = markdown.indexOf('## Evaluation Table')
  if (start === -1) return ''
  const end = markdown.indexOf('## Batch Summaries', start)
  return markdown.slice(start, end === -1 ? undefined : end)
}

function parseEvaluationRow(line: string): CustomerEvaluationRow | null {
  const match = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|[\s\S]*\|\s*(\d+(?:\.\d+)?)\s*\|\s*[^|]*\|$/u)
  if (!match) return null

  const no = Number(match[1])
  const score = Number(match[4])
  if (!Number.isInteger(no) || no < 1 || !Number.isFinite(score)) return null

  return {
    no,
    question: match[3]?.trim() ?? '',
    originalScore: score,
    score,
  }
}

export function parseCustomerEvaluationRows(markdown: string): CustomerEvaluationRow[] {
  return evaluationTableContent(markdown)
    .split(/\r?\n/)
    .map(parseEvaluationRow)
    .filter((row): row is CustomerEvaluationRow => Boolean(row))
}

function timestampKey(filename: string) {
  return filename.match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/u)?.[0] ?? filename
}

function readRetestEntries(content: string): RetestEntry[] {
  const parsed = JSON.parse(content) as { entries?: unknown }
  return Array.isArray(parsed.entries) ? (parsed.entries as RetestEntry[]) : []
}

function readStrictQuality(value: unknown): RetestEntryMetadata['strictQuality'] | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  return {
    suggestedScore:
      typeof record.suggestedScore === 'number' ? record.suggestedScore : undefined,
    tier: typeof record.tier === 'string' ? record.tier : undefined,
    reason: typeof record.reason === 'string' ? record.reason : undefined,
  }
}

function readRetestMetadata(entry: RetestEntry, artifactFilename: string): RetestEntryMetadata {
  const result = entry.result
  const strictQuality = readStrictQuality(result?.diagnostics?.strictQuality)
  const entrySuggestedScore =
    typeof entry.suggestedScore === 'number' ? entry.suggestedScore : undefined
  return {
    artifactFilename,
    answer: typeof result?.answer === 'string' ? result.answer : undefined,
    classification: typeof entry.classification === 'string' ? entry.classification : undefined,
    refusal: typeof result?.refusal === 'boolean' ? result.refusal : undefined,
    suggestedScore:
      typeof strictQuality?.suggestedScore === 'number'
        ? strictQuality.suggestedScore
        : entrySuggestedScore,
    strictVerdict:
      typeof result?.diagnostics?.strictVerdict === 'string'
        ? result.diagnostics.strictVerdict
        : undefined,
    strictQuality,
    citationCount: Array.isArray(result?.citations) ? result.citations.length : 0,
  }
}

export function buildEffectiveEvaluationRows(
  rows: CustomerEvaluationRow[],
  artifacts: RetestArtifact[]
): CustomerEffectiveEvaluationRow[] {
  const byNo = new Map(rows.map((row) => [row.no, { ...row } as CustomerEffectiveEvaluationRow]))
  const sortedArtifacts = [...artifacts].sort((left, right) => {
    const timestampComparison = timestampKey(left.filename).localeCompare(timestampKey(right.filename))
    return timestampComparison || left.filename.localeCompare(right.filename)
  })

  for (const artifact of sortedArtifacts) {
    for (const entry of readRetestEntries(artifact.content)) {
      const no = Number(entry.row?.no)
      const row = byNo.get(no)
      if (!row) continue
      const metadata = readRetestMetadata(entry, artifact.filename)
      const suggestedScore = Number(metadata.suggestedScore)
      if (!Number.isFinite(suggestedScore)) continue
      row.score = suggestedScore
      row.latestRetest = metadata
    }
  }

  return rows.map((row) => byNo.get(row.no) ?? row)
}

export function applyRetestArtifacts(
  rows: CustomerEvaluationRow[],
  artifacts: RetestArtifact[]
): CustomerEvaluationRow[] {
  return buildEffectiveEvaluationRows(rows, artifacts).map((row) => {
    const rowWithoutRetest = { ...row }
    delete rowWithoutRetest.latestRetest
    return rowWithoutRetest
  })
}

export function summarizeScoreDistribution(rows: CustomerEvaluationRow[]) {
  const distribution = Object.fromEntries(SCORE_BUCKETS.map((score) => [score, 0])) as Record<
    (typeof SCORE_BUCKETS)[number],
    number
  >

  for (const row of rows) {
    const score = Math.round(row.score) as (typeof SCORE_BUCKETS)[number]
    if (score in distribution) distribution[score] += 1
  }

  return distribution
}
