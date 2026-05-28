import { DEFAULT_FLEXIBLE_PROMPT, withBotNamePrompt } from '@/lib/ai/prompts'
import { AiTimeoutError, resolveAiTimeoutMs } from '@/lib/ai/deadline'
import type { MvpResponseLanguage } from '@/lib/ai/language'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { buildRagContext, type RagChunk } from '@/lib/knowledge-base/rag'

type RagAnswerGenerateSettings = {
    prompt?: string | null
    bot_name?: string | null
}

type RagConversationTurn = {
    role: 'user' | 'assistant'
    content: string
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

export type RagAnswerGenerateUsage = {
    inputTokens: number
    outputTokens: number
    totalTokens: number
}

export type RagAnswerGenerateResult = {
    answer: string
    usedGeneration: boolean
    addedEngagement: boolean
    usage: RagAnswerGenerateUsage | null
    model: string
}

type GeneratePayload = {
    answer: string
    supportQuotes: string[]
    engagementQuestion: string
    engagementEvidence: string
}

const DEFAULT_RAG_GENERATE_MODEL = 'gpt-4o-mini'
const RAG_GENERATE_MAX_CONTEXT_TOKENS = 1200
const RAG_GENERATE_MAX_OUTPUT_TOKENS = 320

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
    /\bdaha\s+fazla\s+bilgiye\s+ihtiyac/i,
    /\bdaha\s+fazla\s+bilgi\s+istersen(?:iz)?\s+yardimci/i,
    /\bdetayli\s+bilgi\s+almak\s+istersen(?:iz)?\s+yardimci/i,
    /\bogrenci\s+misin/i
]

const ENGAGEMENT_STOPWORDS = new Set([
    'about',
    'almak',
    'also',
    'belge',
    'bilgi',
    'bilgisi',
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
    'program',
    'programi',
    'programin',
    'related',
    'same',
    'source',
    'topic',
    'want',
    'would'
])

function resolveRagGenerateModel(model?: string) {
    return model?.trim()
        || process.env.OPENAI_RAG_GENERATE_MODEL?.trim()
        || process.env.OPENAI_RAG_MODEL?.trim()
        || DEFAULT_RAG_GENERATE_MODEL
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

function compactDigits(value: string) {
    return value.replace(/\D/g, '')
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
    if (!Array.isArray(value)) return []
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
}

function parseGeneratePayload(content: string): GeneratePayload | null {
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
            supportQuotes: readStringArray(parsed.support_quotes),
            engagementQuestion: readString(parsed.engagement_question),
            engagementEvidence: readString(parsed.engagement_evidence)
        }
    } catch {
        return null
    }
}

function normalizeUsage(usage: CompletionUsage | undefined, fallback: { input: string; output: string }): RagAnswerGenerateUsage {
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

function buildRagGenerateCompletionParameters(model: string) {
    if (usesReasoningChatCompletionParameters(model)) {
        return {
            reasoning_effort: 'none',
            max_completion_tokens: RAG_GENERATE_MAX_OUTPUT_TOKENS
        }
    }

    return {
        temperature: 0.25,
        max_tokens: RAG_GENERATE_MAX_OUTPUT_TOKENS
    }
}

async function createDefaultCompletion(args: Record<string, unknown>, options?: CreateCompletionOptions) {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('Missing OPENAI_API_KEY for grounded RAG answer generation')
    }

    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
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

function extractDocumentCodes(value: string) {
    return value.match(/\p{Lu}{2,12}(?:\.\p{Lu}{2,12}){0,2}\.\d{3,4}|\p{Lu}{2,12}YNG\.\d{3,4}/gu) ?? []
}

function containsRawUrl(value: string) {
    return /https?:\/\//i.test(value)
}

function hasContextQuote(context: string, quote: string) {
    const normalizedQuote = normalizeForMatch(quote)
    if (normalizedQuote.length < 14) return false
    return normalizeForMatch(context).includes(normalizedQuote)
}

function hasAnySupportQuote(context: string, quotes: string[]) {
    return quotes.some((quote) => hasContextQuote(context, quote))
}

function criticalFactsSupported(answer: string, context: string) {
    const normalizedContext = normalizeForMatch(context)
    const contextDigits = compactDigits(context)
    const normalizedAnswer = normalizeForMatch(answer)

    for (const email of extractEmails(answer)) {
        if (!normalizedContext.includes(normalizeForMatch(email))) return false
    }

    for (const phone of extractPhones(answer)) {
        const digits = compactDigits(phone)
        if (digits.length >= 8 && !contextDigits.includes(digits)) return false
    }

    for (const code of extractDocumentCodes(answer)) {
        if (!normalizedContext.includes(normalizeForMatch(code))) return false
    }

    for (const number of extractNumbers(answer)) {
        const normalizedNumber = normalizeForMatch(number)
        const digits = compactDigits(number)
        if (!digits) continue
        if (!normalizedContext.includes(normalizedNumber) && !contextDigits.includes(digits)) return false
    }

    if (containsRawUrl(answer)) return false
    if (/\bno_answer\b/i.test(normalizedAnswer)) return false

    return true
}

function tokenizeSignalTerms(value: string) {
    const normalized = normalizeForMatch(value)
    return new Set(normalized
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .map(stemEngagementToken)
        .filter((token) => token.length >= 4)
        .filter((token) => !ENGAGEMENT_STOPWORDS.has(token)))
}

function stemEngagementToken(token: string) {
    const suffixes = [
        'lerinin',
        'larinin',
        'lerini',
        'larini',
        'sinin',
        'sini',
        'sina',
        'sine',
        'inin',
        'ini',
        'ina',
        'ine',
        'nin',
        'in',
        'un',
        'leri',
        'lari',
        'ler',
        'lar',
        'si',
        'i'
    ]

    for (const suffix of suffixes) {
        if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
            return token.slice(0, -suffix.length)
        }
    }

    return token
}

function hasEngagementEvidenceOverlap(anchor: string, evidence: string) {
    const anchorTerms = tokenizeSignalTerms(anchor)
    if (anchorTerms.size === 0) return false

    const evidenceTerms = tokenizeSignalTerms(evidence)
    for (const term of anchorTerms) {
        if (evidenceTerms.has(term)) return true
    }

    return false
}

function isGenericEngagement(question: string) {
    const normalized = normalizeForMatch(question)
    return GENERIC_ENGAGEMENT_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isEngagementSafe(input: {
    answer: string
    userMessage: string
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
    if (!hasContextQuote(input.context, evidence)) return false
    return hasEngagementEvidenceOverlap(`${input.userMessage} ${input.answer}`, evidence)
}

function composeAnswer(answer: string, engagementQuestion: string, shouldAddEngagement: boolean) {
    const trimmedAnswer = answer.trim()
    const trimmedEngagement = engagementQuestion.trim()
    if (!shouldAddEngagement || !trimmedEngagement) return trimmedAnswer
    if (normalizeForMatch(trimmedAnswer).includes(normalizeForMatch(trimmedEngagement))) return trimmedAnswer
    return `${trimmedAnswer}\n\n${trimmedEngagement}`
}

function buildSystemPrompt(input: {
    settings?: RagAnswerGenerateSettings
    responseLanguage: MvpResponseLanguage
    context: string
    conversationHistory?: RagConversationTurn[]
}) {
    const basePrompt = withBotNamePrompt(
        input.settings?.prompt || DEFAULT_FLEXIBLE_PROMPT,
        input.settings?.bot_name
    )
    const languageName = input.responseLanguage === 'tr' ? 'Turkish' : 'English'
    const history = formatConversationHistory(input.conversationHistory ?? [])

    return `${basePrompt}

You are generating a grounded RAG answer. Keep the answer in ${languageName}.
Treat the organization-specific AI assistant instructions above as the voice and behavior contract for tone, warmth, and style.
Do not answer from memory. Use only the provided context.
Answer naturally and helpfully, not like a rule-based extractor, but preserve exact factual values from the context.
Use a warm conversational tone that matches the organization instructions. Avoid robotic bare extractions when a short human sentence would be clearer.
If the context does not contain enough evidence to answer, return answer as "NO_ANSWER" with an empty support_quotes array.
Do not add facts, names, dates, numbers, contact details, rules, links, eligibility claims, or next steps that are not in the context.
Do not include source URLs in the answer; source links are added by the application.
Every factual answer must include at least one exact support quote copied from the context in support_quotes.
For exact fields such as person names, fees, dates, document numbers, quotas, phone numbers, email addresses, addresses, durations, and percentages, copy values exactly.
If sources conflict, answer only the part supported by the best matching quote and avoid unsupported certainty.
Use recent conversation only to resolve references such as "this program", "there", or "it"; the factual answer must still be grounded in the context quotes.
If the user asks a context-dependent follow-up and recent conversation does not identify the missing subject, return answer as "NO_ANSWER" instead of guessing from unrelated chunks.

Prefer to include exactly one short role-neutral engagement question or offer when the context contains a directly related adjacent detail. It must be supported by engagement_evidence copied exactly from the context.
Do not ask about the user's role, status, department, or identity. Do not add generic closers such as "anything else", "başka bir konuda yardımcı olabilir miyim", or "daha fazla bilgi istersen yardımcı olurum".

Return JSON only:
{
  "answer": "grounded answer without source URLs",
  "support_quotes": ["one or more exact quotes from the context supporting the answer"],
  "engagement_question": "optional short grounded follow-up question or offer",
  "engagement_evidence": "exact quote from the context supporting the engagement"
}

Recent conversation:
${history}

Context:
${input.context}`
}

function formatConversationHistory(history: RagConversationTurn[]) {
    const turns = history
        .filter((turn) => turn.content.trim())
        .slice(-6)

    if (turns.length === 0) return 'No recent history.'

    return turns
        .map((turn, index) => {
            const role = turn.role === 'assistant' ? 'Assistant' : 'User'
            const content = turn.content.replace(/\s+/g, ' ').trim().slice(0, 320)
            return `${index + 1}. ${role}: ${content}`
        })
        .join('\n')
}

function fallbackResult(model: string, usage: RagAnswerGenerateUsage | null = null): RagAnswerGenerateResult {
    return {
        answer: '',
        usedGeneration: false,
        addedEngagement: false,
        usage,
        model
    }
}

export async function generateGroundedRagAnswer(input: {
    userMessage: string
    responseLanguage: MvpResponseLanguage
    chunks: RagChunk[]
    settings?: RagAnswerGenerateSettings
    conversationHistory?: RagConversationTurn[]
    model?: string
    timeoutMs?: number
    createCompletion?: CreateCompletion
}): Promise<RagAnswerGenerateResult> {
    const model = resolveRagGenerateModel(input.model)
    if (!input.userMessage.trim() || input.chunks.length === 0) return fallbackResult(model)

    const { context } = buildRagContext(input.chunks, { maxTokens: RAG_GENERATE_MAX_CONTEXT_TOKENS })
    if (!context.trim()) return fallbackResult(model)

    const systemPrompt = buildSystemPrompt({
        settings: input.settings,
        responseLanguage: input.responseLanguage,
        context,
        conversationHistory: input.conversationHistory
    })
    const userPrompt = `User question: ${input.userMessage}`

    let completion: CompletionResponse
    try {
        const createCompletion = input.createCompletion ?? createDefaultCompletion
        completion = await createCompletionWithTimeout(createCompletion, {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
            ...buildRagGenerateCompletionParameters(model)
        }, 'rag_answer_generate', input.timeoutMs)
    } catch (error) {
        console.error('Grounded RAG answer generation failed; falling back to existing RAG path', error)
        return fallbackResult(model)
    }

    const rawContent = completion.choices?.[0]?.message?.content?.trim() ?? ''
    const payload = parseGeneratePayload(rawContent)
    const usage = normalizeUsage(completion.usage, {
        input: `${systemPrompt}\n${userPrompt}`,
        output: rawContent
    })
    if (!payload) return fallbackResult(model, usage)

    if (!hasAnySupportQuote(context, payload.supportQuotes)) {
        return fallbackResult(model, usage)
    }

    if (!criticalFactsSupported(payload.answer, context)) {
        return fallbackResult(model, usage)
    }

    const shouldAddEngagement = isEngagementSafe({
        answer: payload.answer,
        userMessage: input.userMessage,
        engagementQuestion: payload.engagementQuestion,
        engagementEvidence: payload.engagementEvidence,
        context
    })

    return {
        answer: composeAnswer(payload.answer, payload.engagementQuestion, shouldAddEngagement),
        usedGeneration: true,
        addedEngagement: shouldAddEngagement,
        usage,
        model
    }
}
