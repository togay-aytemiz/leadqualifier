import OpenAI from 'openai'

import type { MvpResponseLanguage } from '@/lib/ai/language'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import { parseJsonObject } from '@/lib/knowledge-base/simple-rag/contracts'

type CompletionResult = {
    choices?: Array<{ message?: { content?: string | null } | null }>
    usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
    }
}

export type DemoSkillQueryRewriteDecision =
    | 'accepted_previous_offer'
    | 'standalone'
    | 'unresolved'

export type DemoSkillQueryRewriteResult = {
    query: string
    subject: string
    facet: string
    needsClarification: boolean
    usedHistory: boolean
    decision: DemoSkillQueryRewriteDecision
    reason: string
    model: string
    usage: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
    }
}

export type DemoSkillQueryCreateCompletion = (
    input: Record<string, unknown>
) => Promise<CompletionResult>

const DEFAULT_MODEL = 'gpt-4.1-mini'
const MAX_QUERY_CHARS = 300
const MAX_REASON_CHARS = 240

function normalizeText(value: unknown, maxLength: number) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
        : ''
}

function normalizeUsage(usage: CompletionResult['usage']) {
    const inputTokens = usage?.prompt_tokens ?? 0
    const outputTokens = usage?.completion_tokens ?? 0
    return {
        inputTokens,
        outputTokens,
        totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
    }
}

function recentHistory(turns: KnowledgeSearchPlanningTurn[]) {
    return turns
        .filter((turn) => turn.content.trim())
        .slice(-6)
        .map((turn) => ({
            role: turn.role,
            content: turn.content.trim(),
        }))
}

function parseDecision(value: unknown): DemoSkillQueryRewriteDecision | null {
    return value === 'accepted_previous_offer' || value === 'standalone' || value === 'unresolved'
        ? value
        : null
}

function parseRewritePayload(
    payload: unknown,
    model: string,
    usage: DemoSkillQueryRewriteResult['usage']
): DemoSkillQueryRewriteResult | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    const record = payload as Record<string, unknown>
    const query = normalizeText(record.query, MAX_QUERY_CHARS)
    const decision = parseDecision(record.decision)
    if (!query || !decision) return null

    return {
        query,
        subject: normalizeText(record.subject, 180),
        facet: normalizeText(record.facet, 180),
        needsClarification: Boolean(record.needs_clarification ?? record.needsClarification),
        usedHistory: Boolean(record.used_history ?? record.usedHistory),
        decision,
        reason: normalizeText(record.reason, MAX_REASON_CHARS) || 'No reason provided.',
        model,
        usage,
    }
}

async function defaultCompletion(args: Record<string, unknown>) {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY for demo skill query rewriting')
    const client = new OpenAI({ apiKey })
    return client.chat.completions.create(args as never) as Promise<CompletionResult>
}

function systemPrompt(responseLanguage: MvpResponseLanguage) {
    return [
        'Rewrite the latest user message into one standalone query for matching approved Skills.',
        'Your job is to infer what Skill the user is trying to invoke. Do not answer the question.',
        'Use assistant behavior/scope instructions only to identify the active organization, assistant identity, domain scope, and boundaries.',
        'Do not copy long assistant instructions into the query. Do not treat those instructions as factual knowledge for the answer.',
        'Use the organization dictionary only to understand aliases, abbreviations, spelling variants, and shorthand. It is not factual evidence for the final answer.',
        'If a dictionary term has multiple meanings, choose from message and history context. If the meaning remains unresolved and materially changes Skill matching, set needs_clarification true.',
        'Use recent conversation only when the latest user message depends on prior context.',
        'A message depends on prior context when it accepts, confirms, asks to continue, asks to show, asks to share, or politely requests something the assistant just offered.',
        'This can be short or long. Examples: "evet", "olur", "evet göster", "olur hadi bana göster", "evet lütfen devam etmeni rica ediyorum", "bana onu anlatır mısın", "tamam paylaşır mısın".',
        'If the latest message accepts or requests the assistant previous offer, rewrite it as the concrete topic, fact, or program offered by the assistant.',
        'If the latest message provides a missing slot requested by the assistant, combine it with the original requested fact. Example: assistant asks "hangi program?" and user says "Hemşirelik" -> "Hemşirelik ücret, kontenjan ve taban puan bilgileri" when the original request asked for those facts.',
        'If the latest message asks a new standalone question, preserve its meaning and requested facet.',
        'Extract the main subject or entity and the requested facet, such as existence, fee, quota, location, duration, curriculum, laboratory, internship, career, or policy.',
        'If organization context identifies the active institution, use it to resolve broad institution questions such as campuses, address, programs, fees, scholarships, registration, or contact.',
        'Set needs_clarification true only when the missing subject or facet prevents a useful Skill search.',
        'Do not set needs_clarification true merely because the user used informal wording, omitted the active institution name, omitted the year, or asked a broad institution-level question.',
        'If the latest message contains a concrete subject plus a fact facet, keep needs_clarification false even when a narrower filter could be useful; Skill matching can still choose the best reusable answer.',
        'If the latest message cannot be resolved from history, return the original latest message with decision "unresolved".',
        'Never return vague queries like "evet", "devam", "onu göster", "bilgi ver", or "paylaş". If the resolved query would still be vague, return the original message with decision "unresolved".',
        'Prefer the user language. Use Turkish for Turkish conversations.',
        `Default response language: ${responseLanguage}.`,
        'Return JSON only:',
        '{"query":"...","subject":"...","facet":"...","needs_clarification":true|false,"used_history":true|false,"decision":"accepted_previous_offer|standalone|unresolved","reason":"short reason"}',
    ].join('\n')
}

export async function rewriteDemoSkillQuery(input: {
    latestUserMessage: string
    recentMessages: KnowledgeSearchPlanningTurn[]
    organizationContext?: string | null
    assistantInstructionContext?: string | null
    dictionaryContext?: string | null
    responseLanguage: MvpResponseLanguage
    model?: string
    createCompletion?: DemoSkillQueryCreateCompletion
}): Promise<DemoSkillQueryRewriteResult | null> {
    const latestUserMessage = input.latestUserMessage.trim()
    if (!latestUserMessage) return null
    if (!input.createCompletion && !process.env.OPENAI_API_KEY?.trim()) return null

    const model = input.model?.trim() || DEFAULT_MODEL
    const createCompletion = input.createCompletion ?? defaultCompletion
    const completion = await createCompletion({
        model,
        temperature: 0,
        max_tokens: 180,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: systemPrompt(input.responseLanguage) },
            {
                role: 'user',
                content: [
                    `Latest user message:\n${latestUserMessage}`,
                    `Organization context:\n${input.organizationContext?.trim() || 'Not provided'}`,
                    `Assistant behavior/scope instructions:\n${input.assistantInstructionContext?.trim().slice(0, 1200) || 'Not provided'}`,
                    `Organization dictionary:\n${input.dictionaryContext?.trim().slice(0, 4000) || 'Not provided'}`,
                    `Recent history:\n${JSON.stringify(recentHistory(input.recentMessages))}`,
                ].join('\n\n'),
            },
        ],
    })

    const usage = normalizeUsage(completion.usage)
    const parsed = parseRewritePayload(
        parseJsonObject(completion.choices?.[0]?.message?.content ?? ''),
        model,
        usage
    )
    if (!parsed) return null
    return parsed
}
