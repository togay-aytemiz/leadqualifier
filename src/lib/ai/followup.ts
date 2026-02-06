import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai/usage'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { normalizeIntakeFields } from '@/lib/leads/offering-profile-utils'

interface RequiredIntakeFollowupPayload {
    missingFields: string[]
    followupQuestion: string | null
}

export async function getRequiredIntakeFields(options: {
    organizationId: string
    supabase?: any
}) {
    const supabase = options.supabase ?? await createClient()
    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('required_intake_fields')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    return normalizeIntakeFields(profile?.required_intake_fields ?? [])
}

export function buildRequiredIntakeFollowupGuidance(
    requiredFields: string[],
    recentCustomerMessages: string[],
    recentAssistantMessages: string[] = []
) {
    const normalizedFields = normalizeIntakeFields(requiredFields)
    if (normalizedFields.length === 0) return null

    const normalizedMessages = recentCustomerMessages
        .map((message) => message.trim())
        .filter(Boolean)
        .slice(-8)

    const fieldsBlock = normalizedFields.map((field) => `- ${field}`).join('\n')
    const messagesBlock = normalizedMessages.length > 0
        ? normalizedMessages.map((message, index) => `${index + 1}. ${message}`).join('\n')
        : 'none'
    const normalizedAssistantMessages = recentAssistantMessages
        .map((message) => message.trim())
        .filter(Boolean)
        .slice(-3)
    const assistantBlock = normalizedAssistantMessages.length > 0
        ? normalizedAssistantMessages.map((message, index) => `${index + 1}. ${message}`).join('\n')
        : 'none'

    return `Lead qualification context:
Required intake fields:
${fieldsBlock}

Recent customer messages:
${messagesBlock}

Recent assistant replies:
${assistantBlock}

If important required intake fields are still missing, include one concise and natural follow-up question in the same language as the customer.
Choose the most important missing 1-2 fields to ask now.
Avoid repeating greeting/opening phrases if recent assistant replies already included them.
If all required fields are already provided, do not add a follow-up question.`
}

const COMBINING_MARKS = /[\u0300-\u036f]/g
const REQUIRED_INTAKE_FOLLOWUP_SYSTEM_PROMPT = `You help qualify inbound leads for a business.
Given required intake fields and recent customer messages, decide which required fields are still missing.
Only mark a field as missing if customer messages do not clearly provide it.
If at least one field is missing, write one concise, polite follow-up question in the customer's language.
Ask only for the most important 1-2 missing fields in one sentence.
If no fields are missing, set followup_question to null.
Return ONLY JSON in this format:
{ "missing_fields": string[], "followup_question": string | null }`

function normalizeFieldKey(value: string) {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')
        .toLowerCase()
}

function stripJsonFence(value: string) {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    return fenced?.[1]?.trim() ?? value
}

function extractFencedBlocks(value: string) {
    const blocks: string[] = []
    const pattern = /```(?:json)?\s*([\s\S]*?)\s*```/gi
    let match: RegExpExecArray | null = pattern.exec(value)
    while (match) {
        const captured = match[1]?.trim()
        if (captured) blocks.push(captured)
        match = pattern.exec(value)
    }
    return blocks
}

function extractFirstJsonObject(value: string) {
    const text = value.trim()
    if (!text) return null
    if (text.startsWith('{') && text.endsWith('}')) return text

    let startIndex = -1
    let depth = 0

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i]
        if (char === '{') {
            if (depth === 0) startIndex = i
            depth += 1
            continue
        }
        if (char === '}' && depth > 0) {
            depth -= 1
            if (depth === 0 && startIndex !== -1) {
                return text.slice(startIndex, i + 1)
            }
        }
    }

    return null
}

function parseJsonCandidate(value: string) {
    try {
        return JSON.parse(value)
    } catch {
        return null
    }
}

export function parseRequiredIntakeFollowupPayload(raw: string): RequiredIntakeFollowupPayload | null {
    const trimmed = raw.trim()
    if (!trimmed) return null

    const stripped = stripJsonFence(trimmed)
    const candidates = [
        trimmed,
        stripped,
        ...extractFencedBlocks(trimmed),
        extractFirstJsonObject(stripped)
    ].filter((item): item is string => Boolean(item))

    const seen = new Set<string>()

    for (const candidate of candidates) {
        if (seen.has(candidate)) continue
        seen.add(candidate)

        const parsed = parseJsonCandidate(candidate)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue

        const parsedObject = parsed as any
        const rawMissing = parsedObject.missing_fields ?? parsedObject.missingFields
        const rawFollowup = parsedObject.followup_question ?? parsedObject.followupQuestion
        const missingFields = Array.isArray(rawMissing)
            ? normalizeIntakeFields(rawMissing.filter((item): item is string => typeof item === 'string'))
            : []
        const followupQuestion = typeof rawFollowup === 'string' && rawFollowup.trim().length > 0
            ? rawFollowup.trim()
            : null

        return { missingFields, followupQuestion }
    }

    return null
}

export function appendFollowupQuestion(reply: string, followup?: string | null) {
    const trimmed = followup?.trim()
    if (!trimmed) return reply
    return `${reply}\n\n${trimmed}`
}

export async function generateRequiredIntakeFollowup(options: {
    organizationId: string
    conversationId?: string
    recentCustomerMessages?: string[]
    latestUserMessage?: string
    source?: 'telegram' | 'simulator' | 'whatsapp' | 'unknown'
    trackUsage?: boolean
    supabase?: any
    maxMessages?: number
}): Promise<RequiredIntakeFollowupPayload> {
    const supabase = options.supabase ?? await createClient()
    const maxMessages = Math.max(3, Math.min(options.maxMessages ?? 8, 12))

    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('required_intake_fields')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    const requiredFields = normalizeIntakeFields(profile?.required_intake_fields ?? [])
    if (requiredFields.length === 0) {
        return { missingFields: [], followupQuestion: null }
    }

    if (!process.env.OPENAI_API_KEY) {
        return { missingFields: [], followupQuestion: null }
    }

    const providedMessages = (options.recentCustomerMessages ?? [])
        .map((item) => item.trim())
        .filter(Boolean)

    const messages: string[] = providedMessages.length > 0
        ? providedMessages
        : options.conversationId
            ? ((await supabase
                .from('messages')
                .select('content, created_at')
                .eq('conversation_id', options.conversationId)
                .eq('sender_type', 'contact')
                .order('created_at', { ascending: false })
                .limit(maxMessages)).data ?? [])
                .slice()
                .reverse()
                .map((item: { content?: string | null }) => (item.content ?? '').toString().trim())
                .filter(Boolean)
            : []

    const latestMessage = (options.latestUserMessage ?? '').trim()
    if (latestMessage && !messages.some((item: string) => item === latestMessage)) {
        messages.push(latestMessage)
    }

    if (messages.length === 0) {
        return { missingFields: [], followupQuestion: null }
    }

    const requiredFieldList = requiredFields.map((field) => `- ${field}`).join('\n')
    const conversationList = messages.map((message, index) => `${index + 1}. ${message}`).join('\n')
    const userPrompt = `Required intake fields:\n${requiredFieldList}\n\nRecent customer messages:\n${conversationList}`

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 220,
        messages: [
            { role: 'system', content: REQUIRED_INTAKE_FOLLOWUP_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
        ]
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) {
        return { missingFields: [], followupQuestion: null }
    }

    if (options.trackUsage !== false) {
        const usage = completion.usage
        if (usage) {
            await recordAiUsage({
                organizationId: options.organizationId,
                category: 'lead_extraction',
                model: 'gpt-4o-mini',
                inputTokens: usage.prompt_tokens ?? 0,
                outputTokens: usage.completion_tokens ?? 0,
                totalTokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
                metadata: {
                    source: 'required_intake_followup',
                    channel: options.source ?? 'unknown',
                    conversation_id: options.conversationId ?? null
                },
                supabase
            })
        } else {
            const inputTokens = estimateTokenCount(REQUIRED_INTAKE_FOLLOWUP_SYSTEM_PROMPT) + estimateTokenCount(userPrompt)
            const outputTokens = estimateTokenCount(response)
            await recordAiUsage({
                organizationId: options.organizationId,
                category: 'lead_extraction',
                model: 'gpt-4o-mini',
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
                metadata: {
                    source: 'required_intake_followup',
                    channel: options.source ?? 'unknown',
                    conversation_id: options.conversationId ?? null
                },
                supabase
            })
        }
    }

    const parsed = parseRequiredIntakeFollowupPayload(response)
    if (!parsed) {
        return { missingFields: [], followupQuestion: null }
    }

    const requiredMap = new Map<string, string>()
    for (const field of requiredFields) {
        requiredMap.set(normalizeFieldKey(field), field)
    }

    const missingFields = normalizeIntakeFields(
        parsed.missingFields
            .map((field) => requiredMap.get(normalizeFieldKey(field)))
            .filter((field): field is string => Boolean(field))
    )

    if (missingFields.length === 0) {
        return { missingFields: [], followupQuestion: null }
    }

    return {
        missingFields,
        followupQuestion: parsed.followupQuestion
    }
}
