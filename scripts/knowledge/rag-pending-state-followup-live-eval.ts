import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import sourceManifest from '@/lib/knowledge-base/provider-data/yiu-tanitim-gunleri-2026-source-manifest.json'
import { BROCHURE_SOURCE_PRIORITY_GROUPS } from '@/lib/knowledge-base/rag-eval/brochure-query-plan'
import { normalizeForEval } from '@/lib/knowledge-base/rag-eval/evaluator'
import { runOpenAiFileSearchValidatedQuestion } from '@/lib/knowledge-base/rag-eval/openai-file-search-validated'
import type { RagPendingClarificationState, RagProviderResult } from '@/lib/knowledge-base/rag-eval/types'

type StateDecision = 'use' | 'ignore' | 'split' | 'clarify'

type Scenario = {
  id: string
  name: string
  pending: RagPendingClarificationState
  latest: string
  expectedDecision: StateDecision
  expectedAction?: 'rewrite' | 'clarify'
  expectedMetric?: string
}

type Args = {
  out?: string
  vectorStore?: string
  model?: string
  answerModel?: string
  maxResults?: string
}

type ScoredRun = {
  scenario: Scenario
  result: RagProviderResult
  score: number
  notes: string[]
}

const programListPending: RagPendingClarificationState = {
  originalQuestion: 'hangi bölümlere kayıt olabilirim',
  clarificationQuestion:
    'Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz?',
  missingSlots: ['scope'],
  requestedMetric: 'program_list',
  retrievalIntent: 'program_list',
  sourcePreference: ['primary_campaign_material', 'website_html'],
  riskLevel: 'low',
  doNotRetrieveText: [
    'Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz?',
  ],
}

const tableMetricPending: RagPendingClarificationState = {
  originalQuestion: 'taban puanlar nedir',
  clarificationQuestion: 'Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz?',
  missingSlots: ['program', 'row_variant'],
  requestedMetric: 'base_score',
  retrievalIntent: 'base_score',
  sourcePreference: ['primary_campaign_material'],
  riskLevel: 'medium',
  doNotRetrieveText: ['Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz?'],
}

const internshipPending: RagPendingClarificationState = {
  originalQuestion: 'staj kaç gün',
  clarificationQuestion: 'Hangi bölüm veya program için staj süresini öğrenmek istiyorsunuz?',
  missingSlots: ['program'],
  requestedMetric: 'internship_duration',
  retrievalIntent: 'internship_duration',
  riskLevel: 'medium',
  doNotRetrieveText: ['Hangi bölüm veya program için staj süresini öğrenmek istiyorsunuz?'],
}

const scenarios: Scenario[] = [
  {
    id: 'pending-followup-01',
    name: 'short all-scope answer',
    pending: programListPending,
    latest: 'tümü',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-02',
    name: 'student says hepsi',
    pending: programListPending,
    latest: 'hepsi',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-03',
    name: 'long all-program answer',
    pending: programListPending,
    latest: 'genel olarak tüm bölümler hakkında bilgi almak istiyorum',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-04',
    name: 'natural all-scope sentence with typo',
    pending: programListPending,
    latest: 'tum bolumleri gormek istiyom',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-05',
    name: 'burslu selection',
    pending: programListPending,
    latest: 'burslu olanlar',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-06',
    name: 'burslu shorthand',
    pending: programListPending,
    latest: 'bursluları göster',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-07',
    name: 'lisans scope',
    pending: programListPending,
    latest: 'lisansları söyle',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-08',
    name: 'associate degree scope typo',
    pending: programListPending,
    latest: 'on lisanslar',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-09',
    name: 'indifferent all-scope answer',
    pending: programListPending,
    latest: 'fark etmez hepsi olur',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-10',
    name: 'paid variants still scope not price',
    pending: programListPending,
    latest: 'ücretli de olur hepsini yaz',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-11',
    name: 'question-like but LLM says it fills pending scope',
    pending: programListPending,
    latest: 'tüm bölümler var mı acaba',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-12',
    name: 'health area scope answer',
    pending: programListPending,
    latest: 'sağlık alanındaki tüm seçenekleri görmek istiyorum',
    expectedDecision: 'use',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-13',
    name: 'base score program variant',
    pending: tableMetricPending,
    latest: 'tıp ing ücretli',
    expectedDecision: 'use',
    expectedMetric: 'base_score',
  },
  {
    id: 'pending-followup-14',
    name: 'base score Turkish medicine variant',
    pending: tableMetricPending,
    latest: 'tıp türkçe burslu',
    expectedDecision: 'use',
    expectedMetric: 'base_score',
  },
  {
    id: 'pending-followup-15',
    name: 'base score one-word program',
    pending: tableMetricPending,
    latest: 'hemşirelik',
    expectedDecision: 'use',
    expectedMetric: 'base_score',
  },
  {
    id: 'pending-followup-16',
    name: 'base score abbreviation answer',
    pending: tableMetricPending,
    latest: 'dkt',
    expectedDecision: 'use',
    expectedMetric: 'base_score',
  },
  {
    id: 'pending-followup-17',
    name: 'base score typo abbreviation answer',
    pending: tableMetricPending,
    latest: 'ftr var ya o',
    expectedDecision: 'use',
    expectedMetric: 'base_score',
  },
  {
    id: 'pending-followup-18',
    name: 'internship program answer',
    pending: internshipPending,
    latest: 'anestezi',
    expectedDecision: 'use',
    expectedMetric: 'internship_duration',
  },
  {
    id: 'pending-followup-19',
    name: 'internship colloquial answer',
    pending: internshipPending,
    latest: 'ilk yardım için',
    expectedDecision: 'use',
    expectedMetric: 'internship_duration',
  },
  {
    id: 'pending-followup-20',
    name: 'split all programs plus fees',
    pending: programListPending,
    latest: 'tümü, ücretleri de yaz',
    expectedDecision: 'split',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-21',
    name: 'split scholarship programs plus quota',
    pending: programListPending,
    latest: 'burslu olanlar, kontenjan da lazım',
    expectedDecision: 'split',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-22',
    name: 'split table row plus another metric',
    pending: tableMetricPending,
    latest: 'tıp ing ücretli, başarı sırası da kaç',
    expectedDecision: 'split',
    expectedMetric: 'base_score',
  },
  {
    id: 'pending-followup-23',
    name: 'split program plus campus',
    pending: internshipPending,
    latest: 'hemşirelik, ayrıca kampüs nerde',
    expectedDecision: 'split',
    expectedMetric: 'internship_duration',
  },
  {
    id: 'pending-followup-24',
    name: 'split associate programs plus fees typo',
    pending: programListPending,
    latest: 'on lisanslar ve ucretleri',
    expectedDecision: 'split',
    expectedMetric: 'program_list',
  },
  {
    id: 'pending-followup-25',
    name: 'ignore fresh working-hours question',
    pending: programListPending,
    latest: 'çalışma saatleri nedir?',
    expectedDecision: 'ignore',
  },
  {
    id: 'pending-followup-26',
    name: 'ignore off-topic weather question',
    pending: programListPending,
    latest: 'bugün hava nasıl',
    expectedDecision: 'ignore',
  },
  {
    id: 'pending-followup-27',
    name: 'ignore new transport question',
    pending: tableMetricPending,
    latest: 'kampüse nasıl gidilir',
    expectedDecision: 'ignore',
  },
  {
    id: 'pending-followup-28',
    name: 'ignore new sensitive payment question',
    pending: programListPending,
    latest: 'kredi kartımı yazsam ödeme alır mısın',
    expectedDecision: 'ignore',
  },
  {
    id: 'pending-followup-29',
    name: 'ignore new contact question',
    pending: programListPending,
    latest: 'telefon numarası var mı',
    expectedDecision: 'ignore',
  },
  {
    id: 'pending-followup-30',
    name: 'clarify ambiguous comparison answer',
    pending: tableMetricPending,
    latest: 'hangisi daha iyi',
    expectedDecision: 'clarify',
    expectedAction: 'clarify',
  },
  {
    id: 'pending-followup-31',
    name: 'clarify vague correction',
    pending: internshipPending,
    latest: 'o değil ya',
    expectedDecision: 'clarify',
    expectedAction: 'clarify',
  },
  {
    id: 'pending-followup-32',
    name: 'clarify no usable answer',
    pending: programListPending,
    latest: 'bilmiyorum',
    expectedDecision: 'clarify',
    expectedAction: 'clarify',
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
    if (key === 'out') args.out = value
    else if (key === 'vector-store') args.vectorStore = value
    else if (key === 'model') args.model = value
    else if (key === 'answer-model') args.answerModel = value
    else if (key === 'max-results') args.maxResults = value
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

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function containsNormalized(haystack: string | undefined, needle: string | undefined) {
  if (!haystack || !needle) return false
  return normalizeForEval(haystack).includes(normalizeForEval(needle))
}

function answerIncludesAssistantQuestion(result: RagProviderResult, pending: RagPendingClarificationState) {
  return containsNormalized(result.answer, pending.clarificationQuestion)
}

function scoreRun(scenario: Scenario, result: RagProviderResult): { score: number; notes: string[] } {
  const diagnostics = result.diagnostics
  const actualDecision = diagnostics?.contextualStateDecision
  const action = diagnostics?.contextualOrchestration
  const consumed = diagnostics?.contextualConsumedPendingState
  const pendingUsed = diagnostics?.pendingClarificationUsed
  const contextualQuestion = diagnostics?.contextualQuestion ?? ''
  const notes: string[] = []
  let score = 10

  if (actualDecision !== scenario.expectedDecision) {
    score -= 4
    notes.push(`state_decision expected ${scenario.expectedDecision}, got ${actualDecision ?? '-'}`)
  } else {
    notes.push(`state_decision matched ${scenario.expectedDecision}`)
  }

  if (scenario.expectedDecision === 'ignore') {
    if (pendingUsed || consumed) {
      score -= 4
      notes.push('fresh question incorrectly consumed pending state')
    }
    if (contextualQuestion && containsNormalized(contextualQuestion, scenario.pending.originalQuestion)) {
      score -= 2
      notes.push('contextual question still references stale original question')
    }
    if (answerIncludesAssistantQuestion(result, scenario.pending)) {
      score -= 3
      notes.push('answer repeated the old clarification question')
    }
  } else if (scenario.expectedDecision === 'clarify') {
    if (action !== 'clarify') {
      score -= 5
      notes.push(`expected clarify action, got ${action ?? '-'}`)
    }
    if (pendingUsed || consumed) {
      score -= 2
      notes.push('ambiguous follow-up should not consume pending state')
    }
    if (!/[?？]/.test(result.answer) && !/(hangi|neyi|netleştir)/i.test(result.answer)) {
      score -= 2
      notes.push('clarification answer does not look like a clarification question')
    }
  } else {
    if (!pendingUsed || consumed !== true) {
      score -= 3
      notes.push('slot-filling follow-up did not consume pending state')
    }
    if (!containsNormalized(contextualQuestion, scenario.pending.originalQuestion)) {
      score -= 2
      notes.push('rewritten question does not preserve original question')
    }
    if (!containsNormalized(contextualQuestion, scenario.latest)) {
      score -= 2
      notes.push('rewritten question does not include latest user clarification')
    }
    if (scenario.expectedMetric && diagnostics?.contextualRequestedMetric !== scenario.expectedMetric) {
      score -= 2
      notes.push(
        `requested metric expected ${scenario.expectedMetric}, got ${diagnostics?.contextualRequestedMetric ?? '-'}`
      )
    }
    if (answerIncludesAssistantQuestion(result, scenario.pending)) {
      score -= 4
      notes.push('answer repeated the old clarification question')
    }
    if (result.refusal) {
      score -= 2
      notes.push('final answer was a no-info/refusal despite resolved follow-up')
    }
  }

  return {
    score: Math.max(1, Math.min(10, score)),
    notes,
  }
}

function scoreDistribution(runs: ScoredRun[]) {
  const distribution = new Map<number, number>()
  for (let score = 1; score <= 10; score += 1) distribution.set(score, 0)
  for (const run of runs) {
    distribution.set(run.score, (distribution.get(run.score) ?? 0) + 1)
  }
  return distribution
}

function decisionDistribution(runs: ScoredRun[]) {
  const distribution = new Map<string, number>()
  for (const run of runs) {
    const decision = run.result.diagnostics?.contextualStateDecision ?? '-'
    distribution.set(decision, (distribution.get(decision) ?? 0) + 1)
  }
  return distribution
}

function escapeCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

function markdownReport(input: { runId: string; runs: ScoredRun[]; models: Record<string, string> }) {
  const distribution = scoreDistribution(input.runs)
  const decisions = decisionDistribution(input.runs)
  const averageScore = input.runs.reduce((sum, run) => sum + run.score, 0) / input.runs.length
  const totalCredits = input.runs.reduce(
    (sum, run) => sum + (run.result.usage.estimatedCredits ?? 0),
    0
  )
  const lines = [
    '# RAG Pending State Follow-up Live Evaluation',
    '',
    `Run ID: ${input.runId}`,
    `Retrieval model: ${input.models.retrieval}`,
    `Answer model: ${input.models.answer}`,
    `Evaluator model: ${input.models.evaluator}`,
    `Research planner model: ${input.models.researchPlanner}`,
    `Cases: ${input.runs.length}`,
    `Average score: ${averageScore.toFixed(2)}`,
    `Total estimated credits: ${totalCredits.toFixed(4)}`,
    '',
    '## Score Distribution',
    '',
    '| Score | Count |',
    '|---:|---:|',
  ]

  for (const [score, count] of distribution) {
    if (count > 0) lines.push(`| ${score} | ${count} |`)
  }

  lines.push('', '## State Decision Distribution', '', '| Decision | Count |', '|---|---:|')
  for (const [decision, count] of decisions) lines.push(`| ${decision} | ${count} |`)

  lines.push(
    '',
    '## Runs',
    '',
    '| # | Scenario | Original question | Bot clarification | Student follow-up | Expected decision | Actual decision | Action | Metric | Score | Notes | Answer |',
    '|---:|---|---|---|---|---|---|---|---|---:|---|---|'
  )

  input.runs.forEach((run, index) => {
    const diagnostics = run.result.diagnostics
    lines.push(
      `| ${[
        index + 1,
        escapeCell(run.scenario.name),
        escapeCell(run.scenario.pending.originalQuestion),
        escapeCell(run.scenario.pending.clarificationQuestion),
        escapeCell(run.scenario.latest),
        run.scenario.expectedDecision,
        diagnostics?.contextualStateDecision ?? '-',
        diagnostics?.contextualOrchestration ?? '-',
        diagnostics?.contextualRequestedMetric ?? '-',
        run.score,
        escapeCell(run.notes.join('; ')),
        escapeCell(run.result.answer),
      ].join(' | ')} |`
    )
  })

  return `${lines.join('\n')}\n`
}

async function main() {
  await loadProjectEnv()
  const args = parseArgs(process.argv.slice(2))
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const outputDir = path.resolve(args.out ?? path.join('tmp', 'rag-evals'))
  const retrievalModel =
    args.model?.trim() || process.env.DEMO_CHAT_FILE_SEARCH_RETRIEVAL_MODEL?.trim() || 'gpt-4.1-mini'
  const answerModel =
    args.answerModel?.trim() || process.env.DEMO_CHAT_FILE_SEARCH_ANSWER_MODEL?.trim() || 'gpt-4o-mini'
  const evaluatorModel =
    process.env.DEMO_CHAT_FILE_SEARCH_EVALUATOR_MODEL?.trim() ||
    process.env.OPENAI_RAG_EVALUATOR_MODEL?.trim() ||
    'gpt-4o-mini'
  const researchPlannerModel =
    process.env.DEMO_CHAT_FILE_SEARCH_RESEARCH_PLANNER_MODEL?.trim() ||
    process.env.OPENAI_RAG_RESEARCH_PLANNER_MODEL?.trim() ||
    'gpt-4o-mini'
  const vectorStoreId =
    args.vectorStore?.trim() ||
    process.env.DEMO_CHAT_FILE_SEARCH_VECTOR_STORE_ID?.trim() ||
    sourceManifest.vectorStoreId
  const maxResults = Number.parseInt(args.maxResults ?? '8', 10)
  const client = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') })
  const runs: ScoredRun[] = []

  for (const [index, scenario] of scenarios.entries()) {
    const result = await runOpenAiFileSearchValidatedQuestion({
      client,
      model: retrievalModel,
      answerModel,
      strictEvaluatorModel: evaluatorModel,
      researchPlannerModel,
      vectorStoreId,
      question: scenario.latest,
      conversationHistory: [
        { role: 'user', content: scenario.pending.originalQuestion },
        { role: 'assistant', content: scenario.pending.clarificationQuestion },
      ],
      pendingClarification: scenario.pending,
      instructionProfile: 'qualy',
      citationSourcesByFilename: sourceManifest.sourcesByFilename,
      sourcePriorityGroups: BROCHURE_SOURCE_PRIORITY_GROUPS,
      maxResults: Number.isFinite(maxResults) ? maxResults : 8,
      maxOutputTokens: 900,
      qualityMode: 'strict',
      enableStrictLlmEvaluator: true,
      enableLlmResearchPlanner: true,
    })
    const scored = scoreRun(scenario, result)
    const run = { scenario, result, score: scored.score, notes: scored.notes }
    runs.push(run)
    console.log(
      `${index + 1}/${scenarios.length} ${scenario.id} score=${run.score} expected=${scenario.expectedDecision} actual=${result.diagnostics?.contextualStateDecision ?? '-'} action=${result.diagnostics?.contextualOrchestration ?? '-'}`
    )
  }

  await mkdir(outputDir, { recursive: true })
  const baseName = `rag-pending-followup-live-eval-${runId}`
  const jsonPath = path.join(outputDir, `${baseName}.json`)
  const markdownPath = path.join(outputDir, `${baseName}.md`)
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        runId,
        models: {
          retrieval: retrievalModel,
          answer: answerModel,
          evaluator: evaluatorModel,
          researchPlanner: researchPlannerModel,
        },
        vectorStoreId,
        runs,
      },
      null,
      2
    ),
    'utf8'
  )
  await writeFile(
    markdownPath,
    markdownReport({
      runId,
      runs,
      models: {
        retrieval: retrievalModel,
        answer: answerModel,
        evaluator: evaluatorModel,
        researchPlanner: researchPlannerModel,
      },
    }),
    'utf8'
  )

  const distribution = Array.from(scoreDistribution(runs).entries())
    .filter(([, count]) => count > 0)
    .map(([score, count]) => `${score}:${count}`)
    .join(', ')
  const averageScore = runs.reduce((sum, run) => sum + run.score, 0) / runs.length
  console.log(`SUMMARY average=${averageScore.toFixed(2)} distribution=${distribution}`)
  console.log(`JSON ${jsonPath}`)
  console.log(`MARKDOWN ${markdownPath}`)
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
