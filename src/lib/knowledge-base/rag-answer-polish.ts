import { DEFAULT_FLEXIBLE_PROMPT, withBotNamePrompt } from '@/lib/ai/prompts'
import { AiTimeoutError, resolveAiTimeoutMs } from '@/lib/ai/deadline'
import type { MvpResponseLanguage } from '@/lib/ai/language'
import { createOpenAiClient } from '@/lib/ai/openai-client'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { buildRagContext, type RagChunk } from '@/lib/knowledge-base/rag'

type RagAnswerPolishSettings = {
    prompt?: string | null
    bot_name?: string | null
}

type CompletionUsage = {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
}

type CompletionResponse = {
    choices?: Array<{
        message?: {
            content?: string | null
        } | null
    }>
    usage?: CompletionUsage
}

type CreateCompletionOptions = {
    signal?: AbortSignal
}

type CreateCompletion = (
    args: Record<string, unknown>,
    options?: CreateCompletionOptions
) => Promise<CompletionResponse>

export type RagAnswerPolishUsage = {
    inputTokens: number
    outputTokens: number
    totalTokens: number
}

export type RagAnswerPolishResult = {
    answer: string
    usedPolish: boolean
    addedEngagement: boolean
    usage: RagAnswerPolishUsage | null
    model: string
}

type PolishPayload = {
    answer: string
    engagementQuestion: string
    engagementEvidence: string
}

const DEFAULT_RAG_POLISH_MODEL = 'gpt-4o-mini'
const RAG_POLISH_MAX_CONTEXT_TOKENS = 900
const RAG_POLISH_MAX_OUTPUT_TOKENS = 260
const RAG_POLISH_MAX_ATTEMPTS = 2

const TURKISH_CHAR_MAP: Record<string, string> = {
    ı: 'i',
    İ: 'i',
    ğ: 'g',
    Ğ: 'g',
    ü: 'u',
    Ü: 'u',
    ş: 's',
    Ş: 's',
    ö: 'o',
    Ö: 'o',
    ç: 'c',
    Ç: 'c'
}

const GENERIC_ENGAGEMENT_PATTERNS = [
    /\bbaska\s+bir\s+(?:konu|soru)/i,
    /\banything\s+else\b/i,
    /\bcan\s+i\s+help\s+with\s+anything\s+else\b/i,
    /\byardimci\s+olabilir(?:im|iz| miyim)/i,
    /\bdaha\s+fazla\s+(?:bilgi|detay)(?:\s+almak)?\s+ister\s+misin(?:iz)?/i,
    /\bdaha\s+fazla\s+bilgiye\s+ihtiyac/i,
    /\bdaha\s+fazla\s+bilgi\s+istersen(?:iz)?\s+yardimci/i,
    /\bdetayli\s+bilgi\s+almak\s+istersen(?:iz)?\s+yardimci/i,
    /\bhangi\s+(?:bolum|program)\w*\s+(?:egitim\s+al|okuyor|okudug|oldug|ilgilen|dusun)/i,
    /\bhangi\s+(?:bolum|program)da\s+okuyor/i,
    /\bhangi\s+(?:rol|statude|status)/i,
    /\bogrenci\s+misin/i
]

const ENGAGEMENT_STOPWORDS = new Set([
    'acaba',
    'about',
    'almak',
    'also',
    'bana',
    'based',
    'belge',
    'belirt',
    'bilgi',
    'bilgisi',
    'biraz',
    'bunu',
    'can',
    'context',
    'daha',
    'detay',
    'detayli',
    'document',
    'from',
    'gore',
    'icin',
    'ilgili',
    'ister',
    'istersen',
    'isterseniz',
    'kisa',
    'kisaca',
    'konu',
    'konuda',
    'learn',
    'more',
    'nedir',
    'olan',
    'olarak',
    'olabilir',
    'program',
    'programi',
    'programin',
    'related',
    'same',
    'sana',
    'show',
    'source',
    'topic',
    'want',
    'would'
])

function resolveRagPolishModel(model?: string) {
    return model?.trim()
        || process.env.OPENAI_RAG_POLISH_MODEL?.trim()
        || process.env.OPENAI_RAG_MODEL?.trim()
        || DEFAULT_RAG_POLISH_MODEL
}

function normalizeForMatch(value: string) {
    return value
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

function parsePolishPayload(content: string): PolishPayload | null {
    const trimmed = content.trim()
    if (!trimmed) return null

    const jsonCandidate = trimmed
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
    const objectMatch = jsonCandidate.match(/\{[\s\S]*\}/)
    const rawJson = objectMatch?.[0] ?? jsonCandidate

    try {
        const parsed = JSON.parse(rawJson) as Record<string, unknown>
        const answer = readString(parsed.answer)
        if (!answer) return null

        return {
            answer,
            engagementQuestion: readString(parsed.engagement_question),
            engagementEvidence: readString(parsed.engagement_evidence)
        }
    } catch {
        return null
    }
}

function normalizeUsage(usage: CompletionUsage | undefined, fallback: { input: string; output: string }): RagAnswerPolishUsage {
    const inputTokens = usage?.prompt_tokens ?? estimateTokenCount(fallback.input)
    const outputTokens = usage?.completion_tokens ?? estimateTokenCount(fallback.output)
    const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens

    return {
        inputTokens,
        outputTokens,
        totalTokens
    }
}

function usesReasoningChatCompletionParameters(model: string) {
    const normalized = model.trim().toLowerCase()
    return /^gpt-5(?:[.-]|$)/.test(normalized) || /^o\d/.test(normalized)
}

function buildRagPolishCompletionParameters(model: string) {
    if (usesReasoningChatCompletionParameters(model)) {
        return {
            reasoning_effort: 'none',
            max_completion_tokens: RAG_POLISH_MAX_OUTPUT_TOKENS
        }
    }

    return {
        temperature: 0.2,
        max_tokens: RAG_POLISH_MAX_OUTPUT_TOKENS
    }
}

async function createDefaultCompletion(args: Record<string, unknown>, options?: CreateCompletionOptions) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('Missing OPENAI_API_KEY for RAG answer polish')
    }

    const openai = createOpenAiClient(process.env.OPENAI_API_KEY)
    return openai.chat.completions.create(args as never, options?.signal ? { signal: options.signal } : undefined) as Promise<CompletionResponse>
}

async function createCompletionWithTimeout(
    createCompletion: CreateCompletion,
    args: Record<string, unknown>,
    stage: string,
    timeoutMs?: number
) {
    const resolvedTimeoutMs = resolveAiTimeoutMs(stage, timeoutMs)
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    try {
        return await Promise.race([
            createCompletion(args, controller?.signal ? { signal: controller.signal } : undefined),
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    controller?.abort()
                    reject(new AiTimeoutError(stage, resolvedTimeoutMs))
                }, resolvedTimeoutMs)
            })
        ])
    } finally {
        if (timeoutId) clearTimeout(timeoutId)
    }
}

function extractEmails(value: string) {
    return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
}

function extractPhones(value: string) {
    return value.match(/(?:\+?\d[\d\s()./-]{7,}\d)/g) ?? []
}

function extractNumbers(value: string) {
    return value.match(/(?<![\p{L}\p{N}])\d+(?:[.,/]\d+)*(?![\p{L}\p{N}])/gu) ?? []
}

function compactDigits(value: string) {
    return value.replace(/\D/g, '')
}

function preservesCriticalFacts(originalAnswer: string, candidateAnswer: string) {
    const normalizedCandidate = normalizeForMatch(candidateAnswer)
    const candidateDigits = compactDigits(candidateAnswer)

    for (const email of extractEmails(originalAnswer)) {
        if (!normalizedCandidate.includes(normalizeForMatch(email))) return false
    }

    for (const phone of extractPhones(originalAnswer)) {
        const digits = compactDigits(phone)
        if (digits.length >= 8 && !candidateDigits.includes(digits)) return false
    }

    for (const number of extractNumbers(originalAnswer)) {
        const digits = compactDigits(number)
        if (digits && !candidateDigits.includes(digits)) return false
    }

    return true
}

function containsRawUrl(value: string) {
    return /https?:\/\//i.test(value)
}

function isCandidateAnswerSafe(originalAnswer: string, candidateAnswer: string) {
    if (!candidateAnswer.trim()) return false
    if (containsRawUrl(candidateAnswer)) return false
    return preservesCriticalFacts(originalAnswer, candidateAnswer)
}

function hasEvidenceQuote(context: string, evidence: string) {
    const normalizedEvidence = normalizeForMatch(evidence)
    if (normalizedEvidence.length < 16) return false

    return normalizeForMatch(context).includes(normalizedEvidence)
}

function tokenizeSignalTerms(value: string) {
    const normalized = normalizeForMatch(value)
    return new Set(normalized
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4)
        .filter((token) => !ENGAGEMENT_STOPWORDS.has(token)))
}

function hasEngagementEvidenceOverlap(question: string, evidence: string) {
    const questionTerms = tokenizeSignalTerms(question)
    if (questionTerms.size === 0) return false

    const evidenceTerms = tokenizeSignalTerms(evidence)
    for (const term of questionTerms) {
        if (evidenceTerms.has(term)) return true
    }

    return false
}

function isGenericEngagement(question: string) {
    const normalized = normalizeForMatch(question)
    return GENERIC_ENGAGEMENT_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isEngagementSafe(input: {
    engagementQuestion: string
    engagementEvidence: string
    context: string
}) {
    const question = input.engagementQuestion.trim()
    const evidence = input.engagementEvidence.trim()

    if (!question || !evidence) return false
    if (question.length > 220) return false
    if (containsRawUrl(question)) return false
    if (isGenericEngagement(question)) return false
    if (!hasEvidenceQuote(input.context, evidence)) return false
    return hasEngagementEvidenceOverlap(question, evidence)
}

function composeAnswer(answer: string, engagementQuestion: string, shouldAddEngagement: boolean) {
    const trimmedAnswer = answer.trim()
    const trimmedEngagement = engagementQuestion.trim()
    if (!shouldAddEngagement || !trimmedEngagement) return trimmedAnswer
    if (normalizeForMatch(trimmedAnswer).includes(normalizeForMatch(trimmedEngagement))) return trimmedAnswer
    return `${trimmedAnswer}\n\n${trimmedEngagement}`
}

function buildSystemPrompt(input: {
    settings?: RagAnswerPolishSettings
    responseLanguage: MvpResponseLanguage
    context: string
}) {
    const basePrompt = withBotNamePrompt(
        input.settings?.prompt || DEFAULT_FLEXIBLE_PROMPT,
        input.settings?.bot_name
    )
    const languageName = input.responseLanguage === 'tr' ? 'Turkish' : 'English'

    return `${basePrompt}

You are polishing an already grounded RAG answer. Keep the answer in ${languageName}.
Treat the organization-specific AI assistant instructions above as the voice and behavior contract for tone, warmth, and style. Do not flatten the assistant into a generic or robotic policy bot.
Use only the provided context. Do not add facts, names, dates, numbers, contact details, rules, links, or eligibility claims that are not in the context.
Make the wording warmer, more natural, and concise, while preserving every factual value from the original answer.
Use a conversational, helpful voice instead of sounding like a policy excerpt. A short natural acknowledgement is okay when it fits, but vary the wording and do not add filler.
Apply explicit organization tone/personality/style instructions more strongly than the terse original answer.
Do not simply mirror the original extractive wording when a warmer organization voice can preserve the same facts.
Do not expose internal retrieval or source mechanics to the end user. Unless the user explicitly asks where the information came from, do not mention brochure, document, PDF, website, table, row, field, citation, quote, source, retrieved context, evidence mechanics, broşür, belge, doküman, PDF, web sitesi, tablo, satır, alan, atıf, kaynak, retrieved context, or kanıt mechanics. Present source-backed facts as the assistant's own concise knowledge.
For tabular facts, convert table/field wording into natural user language. For example, say "ücret" instead of "fiyat alanı"; when the original grounded answer clearly says a burslu quota row has "-" for price, explain it naturally as a burslu/no-fee quota instead of describing the raw table cell.

Try to include exactly one role-neutral engagement question or offer when the context contains a directly related adjacent detail the user could reasonably want next. Leave it empty only when no safe adjacent detail exists. It must be supported by an exact sentence or phrase from the context.
Do not ask about the user's role, status, department, or identity. Do not add generic closers such as "anything else", "başka bir konuda yardımcı olabilir miyim", or "daha fazla bilgi istersen yardımcı olurum".

Return JSON only:
{
  "answer": "polished factual answer without source URLs and without engagement",
  "engagement_question": "optional short grounded follow-up question or offer",
  "engagement_evidence": "exact quote from the context supporting the engagement"
}

Context:
${input.context}`
}

function fallbackResult(answer: string, model: string, usage: RagAnswerPolishUsage | null = null): RagAnswerPolishResult {
    return {
        answer,
        usedPolish: false,
        addedEngagement: false,
        usage,
        model
    }
}

export async function polishGroundedRagAnswer(input: {
    answer: string
    userMessage: string
    responseLanguage: MvpResponseLanguage
    chunks: RagChunk[]
    settings?: RagAnswerPolishSettings
    model?: string
    timeoutMs?: number
    createCompletion?: CreateCompletion
}): Promise<RagAnswerPolishResult> {
    const originalAnswer = input.answer.trim()
    const model = resolveRagPolishModel(input.model)
    if (!originalAnswer || input.chunks.length === 0) return fallbackResult(originalAnswer, model)

    const { context } = buildRagContext(input.chunks, { maxTokens: RAG_POLISH_MAX_CONTEXT_TOKENS })
    if (!context.trim()) return fallbackResult(originalAnswer, model)

    const systemPrompt = buildSystemPrompt({
        settings: input.settings,
        responseLanguage: input.responseLanguage,
        context
    })
    const userPrompt = [
        `User question: ${input.userMessage}`,
        `Original grounded answer: ${originalAnswer}`
    ].join('\n')

    const createCompletion = input.createCompletion ?? createDefaultCompletion
    const completionArgs = {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        ...buildRagPolishCompletionParameters(model)
    }
    let completion: CompletionResponse | null = null
    let lastError: unknown = null

    for (let attempt = 1; attempt <= RAG_POLISH_MAX_ATTEMPTS; attempt += 1) {
        try {
            completion = await createCompletionWithTimeout(
                createCompletion,
                completionArgs,
                'rag_polish',
                input.timeoutMs
            )
            break
        } catch (error) {
            lastError = error
            if (attempt < RAG_POLISH_MAX_ATTEMPTS) {
                console.warn('RAG answer polish attempt failed; retrying once', error)
            }
        }
    }

    if (!completion) {
        console.error('RAG answer polish failed after retry; using original extractive answer', lastError)
        return fallbackResult(originalAnswer, model)
    }

    const rawContent = completion.choices?.[0]?.message?.content?.trim() ?? ''
    const payload = parsePolishPayload(rawContent)
    const usage = normalizeUsage(completion.usage, {
        input: `${systemPrompt}\n${userPrompt}`,
        output: rawContent
    })
    if (!payload) return fallbackResult(originalAnswer, model, usage)

    if (!isCandidateAnswerSafe(originalAnswer, payload.answer)) {
        return fallbackResult(originalAnswer, model, usage)
    }

    const shouldAddEngagement = isEngagementSafe({
        engagementQuestion: payload.engagementQuestion,
        engagementEvidence: payload.engagementEvidence,
        context
    })
    const answer = composeAnswer(payload.answer, payload.engagementQuestion, shouldAddEngagement)

    return {
        answer,
        usedPolish: normalizeForMatch(payload.answer) !== normalizeForMatch(originalAnswer) || shouldAddEngagement,
        addedEngagement: shouldAddEngagement,
        usage,
        model
    }
}
