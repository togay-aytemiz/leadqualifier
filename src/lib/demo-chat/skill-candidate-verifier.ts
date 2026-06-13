import OpenAI from 'openai'

import { parseJsonObject } from '@/lib/knowledge-base/simple-rag/contracts'
import type { SkillMatch } from '@/types/database'

type CompletionResult = {
    choices?: Array<{ message?: { content?: string | null } | null }>
    usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
    }
}

export type DemoSkillCandidateCreateCompletion = (
    input: Record<string, unknown>
) => Promise<CompletionResult>

export type DemoSkillCandidateVerificationResult = {
    decision: 'skill' | 'no_skill'
    match: SkillMatch | null
    confidence: number
    reason: string
    model: string
    usage: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
    }
}

const DEFAULT_MODEL = 'gpt-4.1-mini'
const MAX_CANDIDATES = 5
const MAX_TEXT_CHARS = 600

function normalizeText(value: unknown, maxLength: number) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
        : ''
}

function normalizeConfidence(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, Math.min(1, parsed))
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

async function defaultCompletion(args: Record<string, unknown>) {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY for demo skill candidate verification')
    const client = new OpenAI({ apiKey })
    return client.chat.completions.create(args as never) as Promise<CompletionResult>
}

function systemPrompt() {
    return [
        'Select an approved Skill only when it directly answers the user requested subject and facet.',
        'Compare meaning, not just shared words or broad topic similarity.',
        'A matching subject with the wrong facet is NO_SKILL. A matching facet for the wrong program, department, service, or entity is NO_SKILL.',
        'Do not choose the nearest candidate merely because candidates were supplied.',
        'When none directly fits, return skill_id null. This is the normal safe result, not an error.',
        'Do not answer the user question.',
        'Return JSON only:',
        '{"skill_id":"candidate-id or null","confidence":0.0,"reason":"short reason"}',
    ].join('\n')
}

export async function verifyDemoSkillCandidates(input: {
    latestUserMessage: string
    standaloneQuery: string
    subject?: string | null
    facet?: string | null
    candidates: SkillMatch[]
    model?: string
    createCompletion?: DemoSkillCandidateCreateCompletion
}): Promise<DemoSkillCandidateVerificationResult | null> {
    const candidates = input.candidates.slice(0, MAX_CANDIDATES)
    if (candidates.length === 0) return null
    if (!input.createCompletion && !process.env.OPENAI_API_KEY?.trim()) return null

    const model = input.model?.trim() || DEFAULT_MODEL
    const createCompletion = input.createCompletion ?? defaultCompletion
    const completion = await createCompletion({
        model,
        temperature: 0,
        max_tokens: 160,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: systemPrompt() },
            {
                role: 'user',
                content: JSON.stringify({
                    latest_user_message: normalizeText(input.latestUserMessage, MAX_TEXT_CHARS),
                    standalone_query: normalizeText(input.standaloneQuery, MAX_TEXT_CHARS),
                    subject: normalizeText(input.subject, 180) || null,
                    facet: normalizeText(input.facet, 180) || null,
                    candidates: candidates.map((candidate) => ({
                        skill_id: candidate.skill_id,
                        title: normalizeText(candidate.title, 220),
                        trigger: normalizeText(candidate.trigger_text, 260),
                        response_summary: normalizeText(candidate.response_text, MAX_TEXT_CHARS),
                        similarity: candidate.similarity,
                    })),
                }),
            },
        ],
    })

    const payload = parseJsonObject(completion.choices?.[0]?.message?.content ?? '')
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    const record = payload as Record<string, unknown>
    const rawSkillId = record.skill_id ?? record.skillId
    const skillId = typeof rawSkillId === 'string' ? rawSkillId.trim() : null
    const confidence = normalizeConfidence(record.confidence)
    const reason = normalizeText(record.reason, 300) || 'No reason provided.'
    const usage = normalizeUsage(completion.usage)

    if (!skillId) {
        return {
            decision: 'no_skill',
            match: null,
            confidence,
            reason,
            model,
            usage,
        }
    }

    const match = candidates.find((candidate) => candidate.skill_id === skillId)
    if (!match) return null

    return {
        decision: 'skill',
        match,
        confidence,
        reason,
        model,
        usage,
    }
}
