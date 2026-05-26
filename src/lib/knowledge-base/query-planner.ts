import OpenAI from 'openai'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'

export interface KnowledgeSearchPlanningTurn {
    role: 'user' | 'assistant'
    content: string
}

export interface KnowledgeSearchQueryPlanUsage {
    inputTokens: number
    outputTokens: number
    totalTokens: number
}

export interface KnowledgeSearchQueryPlan {
    enabled: boolean
    model: string
    reason: 'disabled' | 'missing_openai_key' | 'auto_skipped' | 'empty_query' | 'planned' | 'planner_error'
    searchQueries: string[]
    mustHaveTerms: string[]
    usage?: KnowledgeSearchQueryPlanUsage
}

export type KnowledgeQueryPlannerMode = 'auto' | 'always' | 'disabled'

interface PlannerOptions {
    mode?: KnowledgeQueryPlannerMode
    model?: string
}

const DEFAULT_QUERY_PLANNER_MODEL = 'gpt-4o-mini'
const QUERY_PLANNER_MAX_OUTPUT_TOKENS = 220
const MAX_HISTORY_TURNS = 4
const MAX_QUERY_VARIANTS = 4
const MAX_QUERY_CHARS = 220
const MAX_TERM_CHARS = 80

function normalizePlannerText(value: unknown, maxChars: number) {
    if (typeof value !== 'string') return ''
    return value
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxChars)
        .trim()
}

function normalizeUsage(value: unknown): KnowledgeSearchQueryPlanUsage | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const usage = value as Record<string, unknown>
    const inputTokens = typeof usage.prompt_tokens === 'number'
        ? usage.prompt_tokens
        : typeof usage.inputTokens === 'number'
            ? usage.inputTokens
            : 0
    const outputTokens = typeof usage.completion_tokens === 'number'
        ? usage.completion_tokens
        : typeof usage.outputTokens === 'number'
            ? usage.outputTokens
            : 0
    const totalTokens = typeof usage.total_tokens === 'number'
        ? usage.total_tokens
        : typeof usage.totalTokens === 'number'
            ? usage.totalTokens
            : inputTokens + outputTokens

    return {
        inputTokens: Math.max(0, Math.round(inputTokens)),
        outputTokens: Math.max(0, Math.round(outputTokens)),
        totalTokens: Math.max(0, Math.round(totalTokens))
    }
}

function resolvePlannerMode(mode?: KnowledgeQueryPlannerMode): KnowledgeQueryPlannerMode {
    if (mode) return mode
    const raw = process.env.KNOWLEDGE_QUERY_PLANNER_ENABLED?.trim().toLowerCase()

    if (!raw || raw === 'auto') return 'auto'
    if (['false', 'off', '0', 'disabled', 'disable'].includes(raw)) return 'disabled'
    if (['always', 'true', 'on', '1', 'enabled', 'enable'].includes(raw)) return 'always'

    return 'auto'
}

function normalizeDedupeKey(value: string) {
    return value
        .toLocaleLowerCase('tr-TR')
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function uniqueNormalized(values: string[], maxItems: number, maxChars: number) {
    const seen = new Set<string>()
    const items: string[] = []

    for (const value of values) {
        const normalized = normalizePlannerText(value, maxChars)
        if (!normalized) continue
        const key = normalizeDedupeKey(normalized)
        if (!key || seen.has(key)) continue
        seen.add(key)
        items.push(normalized)
        if (items.length >= maxItems) break
    }

    return items
}

function hasUppercaseAcronym(query: string) {
    return /\b[A-ZÇĞİÖŞÜ]{2,6}\b/u.test(query)
}

function hasPolicyOrRuleSignal(query: string) {
    const normalized = query.toLocaleLowerCase('tr-TR')

    return [
        'sınav',
        'sinav',
        'final',
        'bütünleme',
        'butunleme',
        'mazeret',
        'staj',
        'çift anadal',
        'cift anadal',
        'yönerge',
        'yonerge',
        'yönetmelik',
        'yonetmelik',
        'kurul',
        'not hesap',
        'sınıf geç',
        'sinif gec',
        'girmeden',
        'giremedim'
    ].some((signal) => normalized.includes(signal))
}

function hasContactOrSourceSignal(query: string) {
    const normalized = query.toLocaleLowerCase('tr-TR')

    return [
        'iletişim',
        'iletisim',
        'telefon',
        'e-posta',
        'eposta',
        'email',
        'adres',
        'kampüs',
        'kampus',
        'nerede',
        'link',
        'sayfa'
    ].some((signal) => normalized.includes(signal))
}

function hasConversationalNoise(query: string) {
    const normalized = query.toLocaleLowerCase('tr-TR')
    const tokenCount = normalized.split(/\s+/).filter(Boolean).length

    return tokenCount >= 8
        || /[;:]/.test(query)
        || [
            'merhaba',
            'selam',
            'hızlıca',
            'hizlica',
            'acaba',
            'şunu sor',
            'sunu sor',
            'bu program',
            'bunda',
            'ondaki'
        ].some((signal) => normalized.includes(signal))
}

export function shouldPlanKnowledgeSearchQuery(query: string) {
    const trimmed = query.trim()
    if (!trimmed) return false

    return hasUppercaseAcronym(trimmed)
        || hasConversationalNoise(trimmed)
        || hasPolicyOrRuleSignal(trimmed)
        || (hasContactOrSourceSignal(trimmed) && trimmed.split(/\s+/).filter(Boolean).length >= 3)
}

function formatPlannerHistory(history: KnowledgeSearchPlanningTurn[]) {
    const turns = history
        .filter((turn) => turn.content.trim())
        .slice(-MAX_HISTORY_TURNS)

    if (turns.length === 0) return 'No recent history.'

    return turns
        .map((turn, index) => {
            const role = turn.role === 'assistant' ? 'Assistant' : 'User'
            const content = normalizePlannerText(turn.content, 260)
            return `${index + 1}. ${role}: ${content}`
        })
        .join('\n')
}

function buildFallbackPlan(
    query: string,
    model: string,
    reason: KnowledgeSearchQueryPlan['reason'],
    usage?: KnowledgeSearchQueryPlanUsage
): KnowledgeSearchQueryPlan {
    const trimmed = normalizePlannerText(query, MAX_QUERY_CHARS)

    return {
        enabled: reason !== 'disabled' && reason !== 'missing_openai_key' && reason !== 'auto_skipped' && reason !== 'empty_query',
        model,
        reason,
        searchQueries: trimmed ? [trimmed] : [],
        mustHaveTerms: [],
        ...(usage ? { usage } : {})
    }
}

function parsePlannerJson(content: string) {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const searchQueries = Array.isArray(parsed.search_queries)
        ? parsed.search_queries
        : Array.isArray(parsed.searchQueries)
            ? parsed.searchQueries
            : []
    const mustHaveTerms = Array.isArray(parsed.must_have_terms)
        ? parsed.must_have_terms
        : Array.isArray(parsed.mustHaveTerms)
            ? parsed.mustHaveTerms
            : []

    return {
        searchQueries: searchQueries.filter((item): item is string => typeof item === 'string'),
        mustHaveTerms: mustHaveTerms.filter((item): item is string => typeof item === 'string')
    }
}

export async function planKnowledgeSearchQuery(
    query: string,
    history: KnowledgeSearchPlanningTurn[] = [],
    options: PlannerOptions = {}
): Promise<KnowledgeSearchQueryPlan> {
    const originalQuery = normalizePlannerText(query, MAX_QUERY_CHARS)
    const model = options.model?.trim() || process.env.OPENAI_QUERY_PLANNER_MODEL?.trim() || DEFAULT_QUERY_PLANNER_MODEL
    const mode = resolvePlannerMode(options.mode)

    if (!originalQuery) return buildFallbackPlan(query, model, 'empty_query')
    if (mode === 'disabled') return buildFallbackPlan(originalQuery, model, 'disabled')
    if (mode === 'auto' && !shouldPlanKnowledgeSearchQuery(originalQuery)) {
        return buildFallbackPlan(originalQuery, model, 'auto_skipped')
    }
    if (!process.env.OPENAI_API_KEY) return buildFallbackPlan(originalQuery, model, 'missing_openai_key')

    const systemPrompt = `You are a retrieval query planner for a grounded Knowledge Base chatbot.
Return ONLY valid JSON.
Do not answer the user.
Do not add facts that are not present in the user question or recent history.
Create retrieval-only search variants that help find matching chunks across PDFs, web pages, source URLs, titles, abbreviations, and policy text.
If the question includes an abbreviation, include one variant preserving it and another likely expanded form only when the expansion is clear from context.
Use the user's language.
JSON schema:
{
  "intent": "short retrieval intent label",
  "subject": "main entity or topic, empty if unknown",
  "search_queries": ["1-3 concise retrieval queries"],
  "must_have_terms": ["0-5 terms that should appear in good evidence"]
}`
    const userPrompt = `Recent history:\n${formatPlannerHistory(history)}\n\nUser question:\n${originalQuery}`
    let lastUsage: KnowledgeSearchQueryPlanUsage | undefined

    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const completion = await openai.chat.completions.create({
            model,
            temperature: 0.1,
            max_tokens: QUERY_PLANNER_MAX_OUTPUT_TOKENS,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        })
        const content = completion.choices[0]?.message?.content ?? ''
        const completionUsage = normalizeUsage(completion.usage)
            ?? {
                inputTokens: estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt),
                outputTokens: estimateTokenCount(content),
                totalTokens: estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt) + estimateTokenCount(content)
            }
        lastUsage = completionUsage
        const parsed = parsePlannerJson(content)
        const searchQueries = uniqueNormalized(
            [originalQuery, ...parsed.searchQueries],
            MAX_QUERY_VARIANTS,
            MAX_QUERY_CHARS
        )
        const mustHaveTerms = uniqueNormalized(parsed.mustHaveTerms, 5, MAX_TERM_CHARS)

        return {
            enabled: true,
            model,
            reason: 'planned',
            searchQueries: searchQueries.length > 0 ? searchQueries : [originalQuery],
            mustHaveTerms,
            usage: completionUsage
        }
    } catch (error) {
        const usage = error && typeof error === 'object' && 'usage' in error
            ? normalizeUsage((error as { usage?: unknown }).usage)
            : undefined

        return buildFallbackPlan(originalQuery, model, 'planner_error', usage ?? lastUsage)
    }
}
