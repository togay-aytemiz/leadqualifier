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

type ResponseResult = {
    output_text?: string
    usage?: {
        input_tokens?: number
        output_tokens?: number
        total_tokens?: number
    }
}

export type DemoSkillCandidateCreateCompletion = (
    input: Record<string, unknown>
) => Promise<CompletionResult>

export type DemoSkillCandidateCreateResponse = (
    input: Record<string, unknown>
) => Promise<ResponseResult>

export type DemoSkillCandidateVerificationResult = {
    decision: 'skill' | 'no_skill'
    match: SkillMatch | null
    confidence: number
    coverage: 'direct' | 'partial' | 'none'
    reason: string
    model: string
    usage: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
    }
}

const DEFAULT_MODEL = 'gpt-5.5'
const MAX_CANDIDATES = 20
const MAX_TEXT_CHARS = 600

const SELECTOR_OUTPUT_FORMAT = {
    type: 'json_schema',
    name: 'skill_selector_decision',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            skill_id: { type: ['string', 'null'] },
            coverage: { type: 'string', enum: ['direct', 'partial', 'none'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reason: { type: 'string' },
        },
        required: ['skill_id', 'coverage', 'confidence', 'reason'],
        additionalProperties: false,
    },
} as const

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

function normalizeResponseUsage(usage: ResponseResult['usage']) {
    const inputTokens = usage?.input_tokens ?? 0
    const outputTokens = usage?.output_tokens ?? 0
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

async function defaultResponse(args: Record<string, unknown>) {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY for demo skill candidate verification')
    const client = new OpenAI({ apiKey })
    return client.responses.create(args as never) as Promise<ResponseResult>
}

function systemPrompt() {
    return [
        'Select one supplied Skill only when its response_summary directly answers the latest user message.',
        'The selected Skill must match the exact requested entity, scope, and facet and must contain the actual answer or a clear equivalent.',
        'The standalone query may resolve references, but it must not broaden, soften, or replace the requested outcome.',
        'routing_description and coverage_facets are scope context, not answer evidence.',
        'Related topics, nearby entities, broader background, partial answers, and answers requiring retrieval must return skill_id null.',
        'Broad all-program, all-campus, all-price, all-quota, or university-wide requests require a response_summary covering that broad set.',
        'Do not choose the nearest candidate merely because candidates were supplied. Returning skill_id null is the normal File Search route.',
        'Do not answer the user question.',
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
    createResponse?: DemoSkillCandidateCreateResponse
}): Promise<DemoSkillCandidateVerificationResult | null> {
    const candidates = input.candidates.slice(0, MAX_CANDIDATES)
    if (candidates.length === 0) return null
    if (!input.createCompletion && !input.createResponse && !process.env.OPENAI_API_KEY?.trim()) return null

    const model = input.model?.trim() || DEFAULT_MODEL
    const selectorPayload = JSON.stringify({
        latest_user_message: normalizeText(input.latestUserMessage, MAX_TEXT_CHARS),
        standalone_query: normalizeText(input.standaloneQuery, MAX_TEXT_CHARS),
        subject: normalizeText(input.subject, 180) || null,
        facet: normalizeText(input.facet, 180) || null,
        candidates: candidates.map((candidate) => ({
            skill_id: candidate.skill_id,
            title: normalizeText(candidate.title, 220),
            trigger: normalizeText(candidate.trigger_text, 260),
            routing_description: normalizeText(
                candidate.routing_description,
                MAX_TEXT_CHARS
            ),
            coverage_facets: (candidate.coverage_facets ?? [])
                .map((facet) => normalizeText(facet, 80))
                .filter(Boolean)
                .slice(0, 14),
            response_summary: normalizeText(candidate.response_text, MAX_TEXT_CHARS),
            similarity: candidate.similarity,
        })),
    })

    let rawContent = ''
    let usage: DemoSkillCandidateVerificationResult['usage']
    if (input.createCompletion) {
        const completion = await input.createCompletion({
            model,
            temperature: 0,
            max_tokens: 160,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt() },
                { role: 'user', content: selectorPayload },
            ],
        })
        rawContent = completion.choices?.[0]?.message?.content ?? ''
        usage = normalizeUsage(completion.usage)
    } else {
        const createResponse = input.createResponse ?? defaultResponse
        const response = await createResponse({
            model,
            instructions: systemPrompt(),
            input: selectorPayload,
            max_output_tokens: 400,
            store: false,
            text: { format: SELECTOR_OUTPUT_FORMAT },
            ...(model === 'gpt-5.5' ? { reasoning: { effort: 'none' } } : {}),
        })
        rawContent = response.output_text ?? ''
        usage = normalizeResponseUsage(response.usage)
    }

    const payload = parseJsonObject(rawContent)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    const record = payload as Record<string, unknown>
    const rawSkillId = record.skill_id ?? record.skillId
    const skillId = typeof rawSkillId === 'string' ? rawSkillId.trim() : null
    const rawCoverage = typeof record.coverage === 'string' ? record.coverage.trim().toLowerCase() : ''
    const coverage = rawCoverage === 'direct' || rawCoverage === 'partial' || rawCoverage === 'none'
        ? rawCoverage
        : (skillId ? 'direct' : 'none')
    const confidence = normalizeConfidence(record.confidence)
    const reason = normalizeText(record.reason, 300) || 'No reason provided.'
    if (!skillId || coverage !== 'direct') {
        return {
            decision: 'no_skill',
            match: null,
            confidence,
            coverage: coverage === 'direct' ? 'none' : coverage,
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
        coverage,
        reason,
        model,
        usage,
    }
}
