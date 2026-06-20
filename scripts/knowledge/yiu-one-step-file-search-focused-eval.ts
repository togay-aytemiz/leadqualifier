import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

import OpenAI from 'openai'

import sourceManifest from '@/lib/knowledge-base/provider-data/yiu-tanitim-gunleri-2026-source-manifest.json'
import {
  runOneStepFileSearch,
  type OneStepFileSearchClient,
  type OneStepFileSearchStatus,
} from '@/lib/knowledge-base/simple-rag/one-step-file-search'

const FIXTURE_PATH = 'scripts/knowledge/fixtures/yiu-one-step-file-search-focused-cases.json'
const MODEL = 'gpt-5.5'

type FocusedCase = {
  caseId: string
  poolId: number
  group: 'supported' | 'bounded' | 'unsupported'
  question: string
  expectedStatus: 'answer' | 'no_info'
  forbiddenAnswerPatterns?: string[]
}

type ScorableCase = Pick<FocusedCase, 'caseId' | 'group' | 'expectedStatus' | 'forbiddenAnswerPatterns'>

type ScorableRun = {
  caseId: string
  status: OneStepFileSearchStatus | null
  error: string | null
  answer?: string
}

type FocusedRun = ScorableRun & {
  poolId: number
  group: FocusedCase['group']
  question: string
  expectedStatus: FocusedCase['expectedStatus']
  answer: string
  latencyMs: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  citations: Array<{ title?: string; score?: number }>
  queries: string[]
}

export function scoreFocusedRuns(cases: ScorableCase[], runs: ScorableRun[]) {
  const byId = new Map(runs.map((run) => [run.caseId, run]))
  const completed = cases.map((item) => ({ item, run: byId.get(item.caseId) }))
  const exact = completed.filter(({ item, run }) =>
    run?.error === null && (
      run.status === item.expectedStatus ||
      (item.group === 'bounded' && (run.status === 'answer' || run.status === 'no_info'))
    )
  ).length
  const supported = completed.filter(({ item }) => item.group === 'supported')
  const supportedAnswers = supported.filter(({ run }) =>
    run?.error === null && run.status === 'answer'
  ).length
  const falseAnswers = completed.filter(({ item, run }) =>
    item.group === 'unsupported' && run?.error === null && run.status === 'answer'
  ).length
  const unsafeAnswers = completed.filter(({ item, run }) =>
    run?.error === null && item.forbiddenAnswerPatterns?.some((pattern) =>
      new RegExp(pattern, 'iu').test(run.answer ?? '')
    )
  ).length
  const errors = completed.filter(({ run }) => !run || run.error !== null).length
  const exactStatusAccuracy = cases.length > 0 ? exact / cases.length : 0
  const supportedRecall = supported.length > 0 ? supportedAnswers / supported.length : 0

  return {
    cases: cases.length,
    exactStatusAccuracy,
    supportedRecall,
    falseAnswers,
    unsafeAnswers,
    errors,
    releaseGatePassed:
      errors === 0 && exactStatusAccuracy === 1 && supportedRecall === 1 &&
      falseAnswers === 0 && unsafeAnswers === 0,
  }
}

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

async function loadEnvFile(filePath: string, protectedKeys: Set<string>) {
  try {
    const content = await readFile(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const equalsIndex = trimmed.indexOf('=')
      if (equalsIndex === -1) continue
      const key = trimmed.slice(0, equalsIndex).trim()
      if (!key || protectedKeys.has(key)) continue
      process.env[key] = parseEnvValue(trimmed.slice(equalsIndex + 1))
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function loadProjectEnv() {
  const protectedKeys = new Set(Object.keys(process.env))
  for (const filename of ['.env', '.env.local', '.env.development.local']) {
    await loadEnvFile(path.join(process.cwd(), filename), protectedKeys)
  }
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index] ?? 0
}

function escapeTable(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

async function runWithConcurrency<T>(jobs: Array<() => Promise<T>>, concurrency: number) {
  const results = new Array<T>(jobs.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < jobs.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await jobs[index]!()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()))
  return results
}

async function main() {
  await loadProjectEnv()
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is required')
  const cases = JSON.parse(await readFile(FIXTURE_PATH, 'utf8')) as FocusedCase[]
  const client = new OpenAI({ apiKey }) as unknown as OneStepFileSearchClient

  const runs = await runWithConcurrency(cases.map((item) => async (): Promise<FocusedRun> => {
    const startedAt = Date.now()
    try {
      const result = await runOneStepFileSearch({
        client,
        model: MODEL,
        vectorStoreId: sourceManifest.vectorStoreId,
        latestUserMessage: item.question,
        standaloneQuery: `Yüksek İhtisas Üniversitesi ${item.question}`,
        responseLanguage: 'tr',
        organizationContext: 'Yüksek İhtisas Üniversitesi',
        maxResults: 20,
        citationSourcesByFilename: sourceManifest.sourcesByFilename,
      })
      return {
        caseId: item.caseId,
        poolId: item.poolId,
        group: item.group,
        question: item.question,
        expectedStatus: item.expectedStatus,
        status: result.status,
        answer: result.answer,
        latencyMs: Date.now() - startedAt,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
        citations: result.citations.slice(0, 5).map((citation) => ({
          title: citation.title,
          score: citation.score,
        })),
        queries: result.diagnostics.queries,
        error: null,
      }
    } catch (error) {
      return {
        caseId: item.caseId,
        poolId: item.poolId,
        group: item.group,
        question: item.question,
        expectedStatus: item.expectedStatus,
        status: null,
        answer: '',
        latencyMs: Date.now() - startedAt,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        citations: [],
        queries: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }), 4)

  const scores = scoreFocusedRuns(cases, runs)
  const latencies = runs.filter((run) => !run.error).map((run) => run.latencyMs)
  const summary = {
    ...scores,
    p50LatencyMs: percentile(latencies, 0.5),
    p90LatencyMs: percentile(latencies, 0.9),
    inputTokens: runs.reduce((sum, run) => sum + run.inputTokens, 0),
    outputTokens: runs.reduce((sum, run) => sum + run.outputTokens, 0),
    totalTokens: runs.reduce((sum, run) => sum + run.totalTokens, 0),
  }
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const artifact = { runId, model: MODEL, vectorStoreId: sourceManifest.vectorStoreId, summary, runs }
  await mkdir('tmp/crawl-output', { recursive: true })
  await mkdir('docs/evaluations', { recursive: true })
  const jsonPath = `tmp/crawl-output/yiu-one-step-file-search-focused-${runId}.json`
  const markdownPath = `docs/evaluations/yiu-one-step-file-search-focused-${runId}.md`
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`)
  await writeFile(markdownPath, [
    '# YİÜ One-Step GPT-5.5 File Search Focused Eval',
    '',
    `Run: \`${runId}\`  `,
    `Model: \`${MODEL}\`  `,
    `Summary: \`${JSON.stringify(summary)}\``,
    '',
    '| Group | Question | Expected | Actual | Answer | Sources | Latency | Error |',
    '| --- | --- | --- | --- | --- | --- | ---: | --- |',
    ...runs.map((run) => [
      run.group,
      escapeTable(run.question),
      run.expectedStatus,
      run.status ?? '-',
      escapeTable(run.answer || '-'),
      escapeTable(run.citations.map((citation) => `${citation.title ?? '-'}@${citation.score?.toFixed(2) ?? '-'}`).join('<br>') || '-'),
      `${(run.latencyMs / 1000).toFixed(1)}s`,
      escapeTable(run.error ?? ''),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
    '',
  ].join('\n'))

  console.log(`FOCUSED_JSON ${jsonPath}`)
  console.log(`FOCUSED_MD ${markdownPath}`)
  console.log(`FOCUSED_SUMMARY ${JSON.stringify(summary)}`)
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
