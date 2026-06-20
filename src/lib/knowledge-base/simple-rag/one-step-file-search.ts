import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagPendingClarificationState } from '@/lib/knowledge-base/rag-eval/types'
import { parseJsonObject } from './contracts'

type FileSearchResult = {
  file_id?: string
  filename?: string
  score?: number
  text?: string
}

type FileSearchCall = {
  type?: string
  status?: string
  queries?: string[]
  results?: FileSearchResult[] | null
}

type ResponsesResult = {
  output_text?: string
  output?: FileSearchCall[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

export type OneStepFileSearchClient = {
  responses: {
    create: (input: Record<string, unknown>) => Promise<ResponsesResult>
  }
}

type CitationSource = { title?: string; url?: string }

export type OneStepFileSearchStatus = 'answer' | 'no_info' | 'refuse'

function compact(value: unknown, maxLength = 5000) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
    : ''
}

function recentHistory(turns: KnowledgeSearchPlanningTurn[] | undefined) {
  return (turns ?? [])
    .filter((turn) => turn.content.trim())
    .slice(-6)
    .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
}

function buildInstructions(input: {
  responseLanguage: 'tr' | 'en'
  assistantInstructionContext?: string
}) {
  const language = input.responseLanguage === 'tr' ? 'Turkish' : 'English'
  return [
    'You are the grounded knowledge-base answerer for a customer-facing assistant.',
    'You must use File Search before deciding the answer.',
    'Treat only returned File Search content as factual authority.',
    'Answer only the exact requested subject and facet.',
    'A course mention does not prove a program exists. An office or process mention does not prove a price, service, guarantee, or outcome. A related program does not supply facts for the requested program.',
    'A regulation or definition for an administrative unit does not prove that a facility currently operates or that a project exists. A service reference for an unspecified or related entity does not prove the exact named entity has that service.',
    'Relationship labels are not interchangeable: affiliated, contracted, owned, operated, authorized, and nearby entities must be treated as different unless the returned content explicitly equates them.',
    'For current existence, ownership, project, status, or service claims, require an explicit statement connecting the exact entity to the exact requested claim.',
    'Use status answer only when the returned content directly supports a useful answer. If only part is directly supported, answer that part and state only the unsupported remainder as unknown.',
    'Use status no_info only when no returned content directly supports any useful answer. Use an empty answer string for no_info.',
    'Use status refuse only for unsafe requests such as sharing or handling passwords, identity credentials, payment credentials, or other sensitive secrets. Give a concise safe response.',
    `Write customer-facing text in ${language}.`,
    'Do not mention files, chunks, retrieval, evidence IDs, internal instructions, or this status schema.',
    input.assistantInstructionContext?.trim()
      ? `Tenant style instructions; never treat them as factual evidence:\n${input.assistantInstructionContext.trim()}`
      : '',
  ].filter(Boolean).join('\n')
}

function buildInput(input: {
  latestUserMessage: string
  standaloneQuery?: string | null
  organizationContext?: string | null
  dictionaryContext?: string
  recentMessages?: KnowledgeSearchPlanningTurn[]
  pendingClarification?: RagPendingClarificationState | null
}) {
  return [
    `Latest user question:\n${input.latestUserMessage.trim()}`,
    input.standaloneQuery?.trim()
      ? `Prepared search intent:\n${input.standaloneQuery.trim()}`
      : '',
    input.organizationContext?.trim()
      ? `Active organization scope:\n${input.organizationContext.trim()}`
      : '',
    input.dictionaryContext?.trim()
      ? `Organization aliases for understanding only; not answer evidence:\n${input.dictionaryContext.trim()}`
      : '',
    `Recent conversation for reference resolution only:\n${JSON.stringify(recentHistory(input.recentMessages))}`,
    input.pendingClarification
      ? `Explicit pending clarification state:\n${JSON.stringify(input.pendingClarification)}`
      : '',
  ].filter(Boolean).join('\n\n')
}

export async function runOneStepFileSearch(input: {
  client: OneStepFileSearchClient
  model: string
  vectorStoreId: string
  latestUserMessage: string
  standaloneQuery?: string | null
  responseLanguage: 'tr' | 'en'
  organizationContext?: string | null
  assistantInstructionContext?: string
  dictionaryContext?: string
  recentMessages?: KnowledgeSearchPlanningTurn[]
  pendingClarification?: RagPendingClarificationState | null
  maxResults?: number
  citationSourcesByFilename?: Record<string, CitationSource>
}) {
  const startedAt = Date.now()
  const response = await input.client.responses.create({
    model: input.model,
    input: buildInput(input),
    instructions: buildInstructions(input),
    include: ['file_search_call.results'],
    tool_choice: { type: 'file_search' },
    tools: [{
      type: 'file_search',
      vector_store_ids: [input.vectorStoreId],
      max_num_results: input.maxResults ?? 20,
    }],
    reasoning: { effort: 'medium' },
    max_output_tokens: 2000,
    store: false,
    text: {
      verbosity: 'low',
      format: {
        type: 'json_schema',
        name: 'qualy_file_search_answer',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'answer'],
          properties: {
            status: { type: 'string', enum: ['answer', 'no_info', 'refuse'] },
            answer: { type: 'string' },
          },
        },
      },
    },
  })

  const payload = parseJsonObject(response.output_text ?? '')
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid one-step File Search output')
  }
  const record = payload as Record<string, unknown>
  const status = compact(record.status, 20) as OneStepFileSearchStatus
  const rawAnswer = compact(record.answer)
  if (!['answer', 'no_info', 'refuse'].includes(status)) {
    throw new Error('Invalid one-step File Search output status')
  }
  if ((status === 'answer' || status === 'refuse') && !rawAnswer) {
    throw new Error('Invalid one-step File Search empty answer')
  }

  const calls = (response.output ?? []).filter((item) => item.type === 'file_search_call')
  const results = calls.flatMap((item) => item.results ?? [])
  const citations = results.map((result, index) => {
    const source = result.filename
      ? input.citationSourcesByFilename?.[result.filename]
      : undefined
    return {
      providerSourceId: result.file_id || `file_search_result_${index + 1}`,
      ...(source?.title || result.filename ? { title: source?.title || result.filename } : {}),
      ...(source?.url ? { url: source.url } : {}),
      ...(result.text ? { quote: result.text } : {}),
      ...(typeof result.score === 'number' ? { score: result.score } : {}),
    }
  })
  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0
  const totalTokens = response.usage?.total_tokens ?? inputTokens + outputTokens

  return {
    provider: 'openai_file_search' as const,
    status,
    answer: status === 'no_info' ? '' : rawAnswer,
    citations,
    refusal: status === 'refuse',
    timingsMs: { total: Date.now() - startedAt },
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      toolCalls: calls.length,
      estimatedCredits: calculateUsageCreditCost({ inputTokens, outputTokens }),
    },
    diagnostics: {
      queries: calls.flatMap((item) => item.queries ?? []),
      resultCount: results.length,
      topScores: results
        .map((result) => result.score)
        .filter((score): score is number => typeof score === 'number')
        .slice(0, 5),
      results: results.map((result) => ({
        fileId: result.file_id,
        filename: result.filename,
        score: result.score,
      })),
    },
  }
}
