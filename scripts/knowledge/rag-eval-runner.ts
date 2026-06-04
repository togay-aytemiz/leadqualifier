import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import {
  evaluateProviderResult,
  summarizeProviderResults,
} from '@/lib/knowledge-base/rag-eval/evaluator'
import { runCurrentRagQuestion } from '@/lib/knowledge-base/rag-eval/current-rag'
import { parseBenchmarkCases } from '@/lib/knowledge-base/rag-eval/manifest'
import {
  type OpenAiFileSearchInstructionProfile,
  runOpenAiFileSearchQuestion,
} from '@/lib/knowledge-base/rag-eval/openai-file-search'
import { runOpenAiFileSearchValidatedQuestion } from '@/lib/knowledge-base/rag-eval/openai-file-search-validated'
import { buildCitationSourcesByFilenameFromManifestJson } from '@/lib/knowledge-base/rag-eval/brochure-readiness'
import type {
  RagAnswerProvider,
  RagEvalCase,
  RagEvaluationResult,
  RagProviderResult,
} from '@/lib/knowledge-base/rag-eval/types'

type Args = {
  cases?: string
  provider?: string
  replayJson?: string
  vectorStore?: string
  model?: string
  answerModel?: string
  out?: string
  maxResults?: string
  orgId?: string
  fileSearchProfile?: string
  sourceManifest?: string
}

type ProviderMode = 'current' | 'file-search' | 'file-search-validated' | 'compare' | 'compare-all'

type RagReportEntry = {
  case: RagEvalCase
  result: RagProviderResult
  evaluation: RagEvaluationResult
}

type ReplayReportData = {
  runId?: string
  provider?: string
  organizationId?: string
  models?: {
    fileSearch?: string
    answer?: string
  }
  cases?: RagEvalCase[]
  entries?: Array<{
    case?: RagEvalCase
    result: RagProviderResult
  }>
}

function parseArgs(argv: string[]): Args {
  const args: Args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token?.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }
    index += 1
    if (key === 'cases') args.cases = value
    else if (key === 'provider') args.provider = value
    else if (key === 'replay-json') args.replayJson = value
    else if (key === 'vector-store') args.vectorStore = value
    else if (key === 'model') args.model = value
    else if (key === 'answer-model') args.answerModel = value
    else if (key === 'out') args.out = value
    else if (key === 'max-results') args.maxResults = value
    else if (key === 'org-id') args.orgId = value
    else if (key === 'file-search-profile') args.fileSearchProfile = value
    else if (key === 'source-manifest') args.sourceManifest = value
    else throw new Error(`Unknown argument --${key}`)
  }
  return args
}

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
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
      const value = parseEnvValue(trimmed.slice(equalsIndex + 1))
      if (!key || protectedKeys.has(key)) continue
      process.env[key] = value
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function loadProjectEnv() {
  const protectedKeys = new Set(Object.keys(process.env))
  const cwd = process.cwd()
  await loadEnvFile(path.join(cwd, '.env'), protectedKeys)
  await loadEnvFile(path.join(cwd, '.env.local'), protectedKeys)
  await loadEnvFile(path.join(cwd, '.env.development.local'), protectedKeys)
}

function requireArg(value: string | undefined, message: string) {
  if (!value?.trim()) throw new Error(message)
  return value.trim()
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function parseProviderMode(provider: string): ProviderMode {
  if (
    provider === 'current' ||
    provider === 'file-search' ||
    provider === 'file-search-validated' ||
    provider === 'compare' ||
    provider === 'compare-all'
  )
    return provider
  throw new Error(`Unsupported provider: ${provider}`)
}

function parseFileSearchProfile(value: string | undefined): OpenAiFileSearchInstructionProfile {
  if (!value || value === 'strict') return 'strict'
  if (value === 'qualy') return 'qualy'
  throw new Error(`Unsupported file search profile: ${value}`)
}

function providerLabel(provider: RagAnswerProvider) {
  if (provider === 'current_rag') return 'Current Supabase RAG'
  if (provider === 'openai_file_search_validated') return 'OpenAI File Search Validated'
  return 'OpenAI File Search'
}

function citationSummary(result: RagProviderResult) {
  if (result.citations.length === 0) return '-'
  return result.citations
    .map((citation) => {
      if (citation.title && citation.url) return `${citation.title} <${citation.url}>`
      return citation.title || citation.url || citation.providerSourceId
    })
    .join(' | ')
}

async function loadCitationSourcesByFilename(manifestPath: string | undefined) {
  if (!manifestPath) return undefined
  return buildCitationSourcesByFilenameFromManifestJson(
    await readFile(path.resolve(manifestPath), 'utf8')
  )
}

function usageSummary(result: RagProviderResult) {
  const usage = result.usage
  return [
    `input=${usage.inputTokens ?? 0}`,
    `output=${usage.outputTokens ?? 0}`,
    `total=${usage.totalTokens ?? 0}`,
    `credits=${(usage.estimatedCredits ?? 0).toFixed(4)}`,
    `toolCalls=${usage.toolCalls ?? 0}`,
  ].join(', ')
}

function summarizeEntries(entries: RagReportEntry[], provider: RagAnswerProvider) {
  const providerEntries = entries.filter((entry) => entry.result.provider === provider)
  const summary = summarizeProviderResults(providerEntries.map((entry) => entry.result))
  const passed = providerEntries.filter((entry) => entry.evaluation.passed).length
  const supportedCorrectAnswers = providerEntries.filter(
    (entry) => !entry.case.unsupported && !entry.result.refusal && entry.evaluation.answerCorrect
  )
  const followups = supportedCorrectAnswers.filter(
    (entry) => entry.evaluation.followupPresent
  ).length
  const retries = providerEntries.reduce(
    (sum, entry) => sum + (entry.result.diagnostics?.retryCount ?? 0),
    0
  )
  return {
    count: providerEntries.length,
    passed,
    followups,
    followupEligible: supportedCorrectAnswers.length,
    retries,
    summary,
  }
}

function markdownReport(input: {
  provider: ProviderMode
  runId: string
  entries: RagReportEntry[]
  models?: {
    fileSearch?: string
    answer?: string
  }
}) {
  const currentSummary = summarizeEntries(input.entries, 'current_rag')
  const fileSearchSummary = summarizeEntries(input.entries, 'openai_file_search')
  const validatedSummary = summarizeEntries(input.entries, 'openai_file_search_validated')
  const cases = Array.from(
    new Map(input.entries.map((entry) => [entry.case.id, entry.case])).values()
  )
  const lines = [
    '# RAG Provider Evaluation',
    '',
    `Run ID: ${input.runId}`,
    `Provider: ${input.provider}`,
    `File Search model: ${input.models?.fileSearch ?? '-'}`,
    `Validated answer model: ${input.models?.answer ?? '-'}`,
    `Questions: ${cases.length}`,
    '',
    '## Provider Summary',
    '',
    '| Provider | Passed | Follow-ups | Retries | Avg ms | P50 | P75 | P95 | Max | Total credits | Avg credits |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]

  for (const [provider, providerSummary] of [
    ['Current Supabase RAG', currentSummary] as const,
    ['OpenAI File Search', fileSearchSummary] as const,
    ['OpenAI File Search Validated', validatedSummary] as const,
  ]) {
    if (providerSummary.count === 0) continue
    const summary = providerSummary.summary
    lines.push(
      `| ${provider} | ${providerSummary.passed}/${providerSummary.count} | ${providerSummary.followups}/${providerSummary.followupEligible} | ${providerSummary.retries} | ${summary.latencyMs.average.toFixed(1)} | ${summary.latencyMs.p50} | ${summary.latencyMs.p75} | ${summary.latencyMs.p95} | ${summary.latencyMs.max} | ${summary.estimatedCredits.total.toFixed(4)} | ${summary.estimatedCredits.average.toFixed(4)} |`
    )
  }

  lines.push('', '## Questions And Answers', '')

  cases.forEach((testCase, index) => {
    const caseEntries = input.entries.filter((entry) => entry.case.id === testCase.id)
    lines.push(`### ${index + 1}. ${testCase.id}`)
    lines.push('')
    lines.push(`Question: ${testCase.question}`)
    lines.push('')
    lines.push(`Expected answer terms: ${(testCase.expectedAnswerTerms ?? []).join(' | ') || '-'}`)
    lines.push(
      `Expected any-term groups: ${(testCase.expectedAnyAnswerTermGroups ?? []).map((group) => group.join(' / ')).join(' | ') || '-'}`
    )
    lines.push(`Expected source terms: ${(testCase.expectedSourceTerms ?? []).join(' | ') || '-'}`)
    lines.push(
      `Expected any-source groups: ${(testCase.expectedAnySourceTermGroups ?? []).map((group) => group.join(' / ')).join(' | ') || '-'}`
    )
    lines.push(
      `Preferred source terms: ${(testCase.preferredSourceTerms ?? []).join(' | ') || '-'}`
    )
    lines.push(
      `Expected follow-up terms: ${(testCase.expectedFollowupTerms ?? []).join(' | ') || '-'}`
    )
    lines.push('')

    for (const entry of caseEntries) {
      const { result, evaluation } = entry
      lines.push(`#### ${providerLabel(result.provider)} - ${evaluation.passed ? 'PASS' : 'FAIL'}`)
      lines.push('')
      lines.push(`Latency: ${result.timingsMs.total}ms`)
      lines.push(`Usage: ${usageSummary(result)}`)
      lines.push(`Sources: ${citationSummary(result)}`)
      lines.push(`Answer correct: ${evaluation.answerCorrect}`)
      lines.push(`Required source correct: ${evaluation.sourceCorrect}`)
      lines.push(`Preferred source correct: ${evaluation.preferredSourceCorrect}`)
      lines.push(`Refusal correct: ${evaluation.refusalCorrect}`)
      lines.push(`No hallucination: ${evaluation.noHallucination}`)
      lines.push(`Follow-up present: ${evaluation.followupPresent}`)
      lines.push(`Follow-up correct: ${evaluation.followupCorrect}`)
      lines.push(`Query intent: ${result.diagnostics?.queryIntent ?? '-'}`)
      lines.push(`Targeted retries: ${result.diagnostics?.retryCount ?? 0}`)
      lines.push(`Follow-up: ${result.diagnostics?.followup ?? '-'}`)
      if (evaluation.missingAnswerTerms.length > 0)
        lines.push(`Missing answer terms: ${evaluation.missingAnswerTerms.join(' | ')}`)
      if (evaluation.missingAnyAnswerTermGroups.length > 0)
        lines.push(
          `Missing any-term groups: ${evaluation.missingAnyAnswerTermGroups.map((group) => group.join(' / ')).join(' | ')}`
        )
      if (evaluation.missingSourceTerms.length > 0)
        lines.push(`Missing source terms: ${evaluation.missingSourceTerms.join(' | ')}`)
      if (evaluation.missingAnySourceTermGroups.length > 0)
        lines.push(
          `Missing any-source groups: ${evaluation.missingAnySourceTermGroups.map((group) => group.join(' / ')).join(' | ')}`
        )
      if (evaluation.missingPreferredSourceTerms.length > 0)
        lines.push(
          `Missing preferred source terms: ${evaluation.missingPreferredSourceTerms.join(' | ')}`
        )
      if (evaluation.missingAnyPreferredSourceTermGroups.length > 0)
        lines.push(
          `Missing any-preferred-source groups: ${evaluation.missingAnyPreferredSourceTermGroups.map((group) => group.join(' / ')).join(' | ')}`
        )
      if (evaluation.missingFollowupTerms.length > 0)
        lines.push(`Missing follow-up terms: ${evaluation.missingFollowupTerms.join(' | ')}`)
      if (evaluation.missingAnyFollowupTermGroups.length > 0)
        lines.push(
          `Missing any-follow-up groups: ${evaluation.missingAnyFollowupTermGroups.map((group) => group.join(' / ')).join(' | ')}`
        )
      if (evaluation.forbiddenTermsFound.length > 0)
        lines.push(`Forbidden terms: ${evaluation.forbiddenTermsFound.join(' | ')}`)
      lines.push('')
      lines.push('```text')
      lines.push(result.answer)
      lines.push('```')
      lines.push('')
    }
    lines.push('')
  })

  return `${lines.join('\n')}\n`
}

async function main() {
  await loadProjectEnv()
  const args = parseArgs(process.argv.slice(2))

  if (args.replayJson) {
    const replayPath = path.resolve(args.replayJson)
    const replay = JSON.parse(await readFile(replayPath, 'utf8')) as ReplayReportData
    const provider = parseProviderMode(args.provider ?? replay.provider ?? 'compare')
    const overrideCases = args.cases
      ? parseBenchmarkCases(await readFile(path.resolve(args.cases), 'utf8'))
      : []
    const overrideCasesById = new Map(overrideCases.map((testCase) => [testCase.id, testCase]))
    const entries = (replay.entries ?? []).map<RagReportEntry>((entry) => {
      const testCase = entry.case?.id
        ? (overrideCasesById.get(entry.case.id) ?? entry.case)
        : entry.case
      if (!testCase) throw new Error('Cannot find replay case for provider result')
      return {
        case: testCase,
        result: entry.result,
        evaluation: evaluateProviderResult(testCase, entry.result),
      }
    })
    const outputDir = path.resolve(
      args.out ?? process.env.RAG_COMPARE_OUTPUT_DIR ?? path.dirname(replayPath)
    )
    await mkdir(outputDir, { recursive: true })
    const runId = `${replay.runId ?? new Date().toISOString().replace(/[:.]/g, '-')}-replay`
    const baseName = `rag-eval-${provider}-${runId}`
    const jsonPath = path.join(outputDir, `${baseName}.json`)
    const markdownPath = path.join(outputDir, `${baseName}.md`)
    await writeFile(
      jsonPath,
      JSON.stringify(
        {
          runId,
          provider,
          organizationId: replay.organizationId,
          cases: overrideCases.length > 0 ? overrideCases : replay.cases,
          entries,
          models: replay.models,
          replayedFrom: replayPath,
          replayCaseOverrides:
            overrideCases.length > 0 ? path.resolve(args.cases ?? '') : undefined,
        },
        null,
        2
      ),
      'utf8'
    )
    await writeFile(
      markdownPath,
      markdownReport({ runId, provider, entries, models: replay.models }),
      'utf8'
    )
    const passed = entries.filter((entry) => entry.evaluation.passed).length
    console.log(`SUMMARY ${passed}/${entries.length} provider-results passed`)
    console.log(`JSON ${jsonPath}`)
    console.log(`MARKDOWN ${markdownPath}`)
    return
  }

  const provider = parseProviderMode(args.provider ?? 'file-search')

  const casesPath = path.resolve(requireArg(args.cases, '--cases is required'))
  const cases = parseBenchmarkCases(await readFile(casesPath, 'utf8'))
  const vectorStoreId =
    args.vectorStore?.trim() || process.env.OPENAI_FILE_SEARCH_VECTOR_STORE_ID?.trim()
  if (
    (provider === 'file-search' ||
      provider === 'file-search-validated' ||
      provider === 'compare' ||
      provider === 'compare-all') &&
    !vectorStoreId
  )
    throw new Error(
      '--vector-store or OPENAI_FILE_SEARCH_VECTOR_STORE_ID is required for file-search'
    )

  const openai =
    provider === 'file-search' ||
    provider === 'file-search-validated' ||
    provider === 'compare' ||
    provider === 'compare-all'
      ? new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') })
      : null
  const supabase =
    provider === 'current' || provider === 'compare' || provider === 'compare-all'
      ? createClient(
          requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
          requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        )
      : null
  const organizationId =
    args.orgId?.trim() || process.env.QA_ORG_ID?.trim() || '37222032-c2e8-4125-a027-be39eb6603f8'
  const model = args.model?.trim() || process.env.OPENAI_FILE_SEARCH_MODEL?.trim() || 'gpt-4.1-mini'
  const answerModel =
    args.answerModel?.trim() || process.env.OPENAI_FILE_SEARCH_VALIDATED_ANSWER_MODEL?.trim()
  const models = {
    fileSearch: model,
    answer: answerModel || process.env.OPENAI_RAG_GENERATE_MODEL?.trim() || 'gpt-4o-mini',
  }
  const maxResults = Number.parseInt(
    args.maxResults ?? process.env.OPENAI_FILE_SEARCH_MAX_RESULTS ?? '8',
    10
  )
  const fileSearchProfile = parseFileSearchProfile(
    args.fileSearchProfile ?? process.env.OPENAI_FILE_SEARCH_PROFILE
  )
  const citationSourcesByFilename = await loadCitationSourcesByFilename(
    args.sourceManifest ?? process.env.RAG_EVAL_SOURCE_MANIFEST
  )
  const runId = new Date().toISOString().replace(/[:.]/g, '-')

  const entries: RagReportEntry[] = []
  for (const testCase of cases) {
    if (provider === 'current' || provider === 'compare' || provider === 'compare-all') {
      if (!supabase) throw new Error('Supabase client is required for current provider')
      const result = await runCurrentRagQuestion({
        supabase,
        organizationId,
        question: testCase.question,
        runId,
        caseId: testCase.id,
      })
      const evaluation = evaluateProviderResult(testCase, result)
      entries.push({ case: testCase, result, evaluation })
      console.log(
        `${evaluation.passed ? 'PASS' : 'FAIL'} current ${testCase.id} ${result.timingsMs.total}ms`
      )
    }

    if (provider === 'file-search' || provider === 'compare' || provider === 'compare-all') {
      if (!openai || !vectorStoreId) throw new Error('OpenAI client and vector store are required')
      const result = await runOpenAiFileSearchQuestion({
        client: openai,
        model,
        vectorStoreId,
        question: testCase.question,
        maxResults: Number.isFinite(maxResults) ? maxResults : 8,
        instructionProfile: fileSearchProfile,
        citationSourcesByFilename,
      })
      const evaluation = evaluateProviderResult(testCase, result)
      entries.push({ case: testCase, result, evaluation })
      console.log(
        `${evaluation.passed ? 'PASS' : 'FAIL'} file-search ${testCase.id} ${result.timingsMs.total}ms`
      )
    }

    if (provider === 'file-search-validated' || provider === 'compare-all') {
      if (!openai || !vectorStoreId) throw new Error('OpenAI client and vector store are required')
      const result = await runOpenAiFileSearchValidatedQuestion({
        client: openai,
        model,
        answerModel,
        vectorStoreId,
        question: testCase.question,
        maxResults: Number.isFinite(maxResults) ? maxResults : 8,
        instructionProfile: fileSearchProfile,
        citationSourcesByFilename,
      })
      const evaluation = evaluateProviderResult(testCase, result)
      entries.push({ case: testCase, result, evaluation })
      console.log(
        `${evaluation.passed ? 'PASS' : 'FAIL'} file-search-validated ${testCase.id} ${result.timingsMs.total}ms`
      )
    }
  }

  const outputDir = path.resolve(
    args.out ?? process.env.RAG_COMPARE_OUTPUT_DIR ?? path.join('tmp', 'rag-evals')
  )
  await mkdir(outputDir, { recursive: true })
  const baseName = `rag-eval-${provider}-${runId}`
  const jsonPath = path.join(outputDir, `${baseName}.json`)
  const markdownPath = path.join(outputDir, `${baseName}.md`)
  await writeFile(
    jsonPath,
    JSON.stringify({ runId, provider, organizationId, models, cases, entries }, null, 2),
    'utf8'
  )
  await writeFile(markdownPath, markdownReport({ runId, provider, entries, models }), 'utf8')

  const passed = entries.filter((entry) => entry.evaluation.passed).length
  console.log(`SUMMARY ${passed}/${entries.length} provider-results passed`)
  console.log(`JSON ${jsonPath}`)
  console.log(`MARKDOWN ${markdownPath}`)
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
