import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import type { StrictQuestionUnderstanding } from './strict-question-understanding'
import type { RagProviderCitation } from './types'

type CreateCompletionOptions = {
  signal?: AbortSignal
}

export type StrictLlmEvaluatorUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type StrictLlmEvaluatorAction = 'pass' | 'repair' | 'clarify' | 'refuse' | 'retry'

export type StrictLlmEvaluatorVerdict = {
  action: StrictLlmEvaluatorAction
  reason: string
  revisedAnswer?: string
  clarificationQuestion?: string
  retryQuery?: string
  confidence?: number
}

export type StrictLlmEvaluatorResult = {
  verdict: StrictLlmEvaluatorVerdict
  usage: StrictLlmEvaluatorUsage
  model: string
}

export type StrictLlmCreateCompletion = (
  args: Record<string, unknown>,
  options?: CreateCompletionOptions
) => Promise<{
  choices?: Array<{
    message?: {
      content?: string | null
    } | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}>

const DEFAULT_EVALUATOR_MODEL = 'gpt-4o-mini'
const MAX_EVIDENCE_CHARS = 6000
const MAX_OUTPUT_TOKENS = 360

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readAction(value: unknown): StrictLlmEvaluatorAction | null {
  if (
    value === 'pass' ||
    value === 'repair' ||
    value === 'clarify' ||
    value === 'refuse' ||
    value === 'retry'
  ) {
    return value
  }
  return null
}

function parseJsonObject(content: string) {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const objectMatch = trimmed.match(/\{[\s\S]*\}/)
  const rawJson = objectMatch?.[0] ?? trimmed
  return JSON.parse(rawJson) as Record<string, unknown>
}

function parseVerdict(content: string): StrictLlmEvaluatorVerdict | null {
  try {
    const parsed = parseJsonObject(content)
    const action = readAction(parsed.action)
    const reason = readString(parsed.reason)
    if (!action || !reason) return null

    return {
      action,
      reason,
      ...(readString(parsed.revised_answer) ? { revisedAnswer: readString(parsed.revised_answer) } : {}),
      ...(readString(parsed.clarification_question)
        ? { clarificationQuestion: readString(parsed.clarification_question) }
        : {}),
      ...(readString(parsed.retry_query) ? { retryQuery: readString(parsed.retry_query) } : {}),
      ...(typeof readNumber(parsed.confidence) === 'number'
        ? { confidence: readNumber(parsed.confidence) }
        : {}),
    }
  } catch {
    return null
  }
}

function normalizeUsage(
  usage: Awaited<ReturnType<StrictLlmCreateCompletion>>['usage'],
  fallback: { input: string; output: string }
): StrictLlmEvaluatorUsage {
  const inputTokens = usage?.prompt_tokens ?? estimateTokenCount(fallback.input)
  const outputTokens = usage?.completion_tokens ?? estimateTokenCount(fallback.output)
  const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens
  return {
    inputTokens,
    outputTokens,
    totalTokens,
  }
}

function citationEvidence(citations: RagProviderCitation[]) {
  return citations
    .map((citation, index) =>
      [
        `Evidence ${index + 1}`,
        citation.title ? `Title: ${citation.title}` : '',
        citation.url ? `URL: ${citation.url}` : '',
        citation.quote ? `Quote: ${citation.quote}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n')
    .slice(0, MAX_EVIDENCE_CHARS)
}

function buildMessages(input: {
  question: string
  normalizedQuestion: string
  understanding: StrictQuestionUnderstanding
  answer: string
  citations: RagProviderCitation[]
}) {
  const system = [
    'You are Qualy strict answer evaluator.',
    'Review whether the assistant answer is safe, grounded, and good enough to say in a meeting room with a university president, rector/dean (rektör/dekan), or board chair.',
    'Use only the supplied question, normalized question, strict understanding, answer, and evidence.',
    'Never invent facts. If evidence is missing, choose retry, clarify, repair, or refuse.',
    'When repairing with missing evidence, write a direct no-information boundary; do not use speculative phrases like generally, may/might, probably, genellikle, olabilir, or muhtemelen.',
    'Return only valid JSON with keys: action, reason, revised_answer, clarification_question, retry_query, confidence.',
    'Allowed action values: pass, repair, clarify, refuse, retry.',
  ].join(' ')

  const user = [
    `Original question:\n${input.question}`,
    `Normalized question:\n${input.normalizedQuestion}`,
    `Strict understanding:\n${JSON.stringify({
      intents: input.understanding.intents,
      entities: input.understanding.entities,
      safety: input.understanding.safety,
    })}`,
    `Assistant answer:\n${input.answer}`,
    `Evidence:\n${citationEvidence(input.citations) || 'NO_EVIDENCE'}`,
    [
      'Decision rules:',
      '- pass only if the answer directly answers the question and every positive factual claim is supported by evidence or strict catalog context.',
      '- repair if the answer is close but needs a corrected final answer from supplied evidence.',
      '- retry if the evidence is wrong, weak, or off-topic and a better search query could likely retrieve the answer.',
      '- clarify if the user request is under-specified.',
      '- refuse if the request is unsafe or unsupported and retry is unlikely to help.',
      '- Turkish user questions should receive Turkish final text.',
    ].join('\n'),
  ].join('\n\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function completionParams(model: string) {
  if (/^gpt-5(?:[.-]|$)/i.test(model) || /^o\d/i.test(model)) {
    return {
      reasoning_effort: 'none',
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    }
  }

  return {
    temperature: 0,
    max_tokens: MAX_OUTPUT_TOKENS,
  }
}

async function createDefaultCompletion(args: Record<string, unknown>, options?: CreateCompletionOptions) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY for strict RAG evaluator')
  }
  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai.chat.completions.create(args as never, options?.signal ? { signal: options.signal } : undefined) as Promise<
    Awaited<ReturnType<StrictLlmCreateCompletion>>
  >
}

export async function evaluateAnswerWithStrictLlm(input: {
  question: string
  normalizedQuestion: string
  understanding: StrictQuestionUnderstanding
  answer: string
  citations: RagProviderCitation[]
  model?: string
  createCompletion?: StrictLlmCreateCompletion
}): Promise<StrictLlmEvaluatorResult | null> {
  const model =
    input.model?.trim() ||
    process.env.OPENAI_RAG_EVALUATOR_MODEL?.trim() ||
    process.env.OPENAI_RAG_MODEL?.trim() ||
    DEFAULT_EVALUATOR_MODEL
  const messages = buildMessages(input)
  const completionInput = JSON.stringify(messages)
  const createCompletion = input.createCompletion ?? createDefaultCompletion
  const response = await createCompletion(
    {
      model,
      messages,
      response_format: { type: 'json_object' },
      ...completionParams(model),
    },
    {}
  )
  const rawContent = response.choices?.[0]?.message?.content?.trim() ?? ''
  const verdict = parseVerdict(rawContent)
  if (!verdict) return null

  return {
    verdict,
    usage: normalizeUsage(response.usage, {
      input: completionInput,
      output: rawContent,
    }),
    model,
  }
}
