import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'

const EXTRACTION_SYSTEM_PROMPT = `Extract lead signals as JSON.
Return ONLY valid JSON (no code fences, no extra text).
Return keys: service_type, desired_date, location, budget_signals, intent_signals, risk_signals, non_business, summary, score, status.
intent_signals can include: decisive (explicit booking/appointment intent), urgent (ASAP/today/tomorrow), indecisive (unsure), far_future (months later/next season).
Customer messages are labeled "customer:" and represent the latest 5 customer messages.
Prioritize customer intent and the most recent customer messages.
Do not infer service_type solely from assistant replies; require customer confirmation.
If the customer negates a service (e.g., "X istemiyorum"), do not output that service.
Score must be an integer from 0 to 10.
Status must be one of: hot, warm, cold, ignored.
If non_business is true, set score to 0 and status to ignored.
Use catalog names when possible for service_type; if catalog is empty, infer service_type from the offering profile summary/suggestions when possible.
Use nulls if unknown. Use non_business=true only for personal/social conversations.`

function normalizeStringArray(value: unknown) {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((item) => item.trim())
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        return [value.trim()]
    }
    return []
}

function normalizeBoolean(value: unknown) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['true', 'yes', '1'].includes(normalized)) return true
        if (['false', 'no', '0'].includes(normalized)) return false
    }
    if (typeof value === 'number') return value !== 0
    return false
}

function normalizeScore(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.min(10, Math.round(value)))
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value)
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.min(10, Math.round(parsed)))
        }
        const match = value.match(/(\d{1,2})/)
        const captured = match?.[1]
        if (captured) {
            const fallback = Number.parseInt(captured, 10)
            if (Number.isFinite(fallback)) {
                return Math.max(0, Math.min(10, fallback))
            }
        }
    }
    return 0
}

function normalizeStatus(value: unknown) {
    if (typeof value !== 'string') return 'cold'
    const normalized = value.trim().toLowerCase()
    const aliases: Record<string, 'hot' | 'warm' | 'cold' | 'ignored'> = {
        'sıcak': 'hot',
        'sicak': 'hot',
        'ılık': 'warm',
        'ilik': 'warm',
        'soğuk': 'cold',
        'soguk': 'cold',
        'yok sayıldı': 'ignored',
        'yoksayıldı': 'ignored',
        'ignore': 'ignored',
        'ignored': 'ignored'
    }
    if (aliases[normalized]) return aliases[normalized]
    if (normalized === 'hot' || normalized === 'warm' || normalized === 'cold' || normalized === 'ignored') {
        return normalized
    }
    return 'cold'
}

function stripJsonFence(value: string) {
    const fenceMatch = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fenceMatch?.[1]) return fenceMatch[1].trim()
    return value
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
        } else if (char === '}' && depth > 0) {
            depth -= 1
            if (depth === 0 && startIndex !== -1) {
                return text.slice(startIndex, i + 1)
            }
        }
    }

    return null
}

function hasJsonKey(value: string, key: string) {
    const pattern = new RegExp(`"${key}"\\s*:`, 'i')
    return pattern.test(value)
}

function normalizeExtractionPayload(payload: any) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {
            service_type: null,
            desired_date: null,
            location: null,
            budget_signals: [],
            intent_signals: [],
            risk_signals: [],
            non_business: false,
            summary: null,
            score: 0,
            status: 'cold'
        }
    }

    const nonBusiness = normalizeBoolean(payload.non_business)
    const score = nonBusiness ? 0 : normalizeScore(payload.score)
    const status = nonBusiness ? 'ignored' : normalizeStatus(payload.status)

    return {
        service_type: typeof payload.service_type === 'string' ? payload.service_type.trim() || null : null,
        desired_date: typeof payload.desired_date === 'string' ? payload.desired_date.trim() || null : null,
        location: typeof payload.location === 'string' ? payload.location.trim() || null : null,
        budget_signals: normalizeStringArray(payload.budget_signals),
        intent_signals: normalizeStringArray(payload.intent_signals),
        risk_signals: normalizeStringArray(payload.risk_signals),
        non_business: nonBusiness,
        summary: typeof payload.summary === 'string' ? payload.summary.trim() || null : null,
        score,
        status
    }
}

export function safeParseLeadExtraction(input: string) {
    try {
        const stripped = stripJsonFence(input ?? '')
        const candidate = extractFirstJsonObject(stripped) ?? stripped
        const parsed = JSON.parse(candidate)
        return normalizeExtractionPayload(parsed)
    } catch {
        return normalizeExtractionPayload(null)
    }
}

export async function runLeadExtraction(options: {
    organizationId: string
    conversationId: string
    latestMessage?: string
    supabase?: any
    source?: 'telegram' | 'whatsapp'
}) {
    const supabase = options.supabase ?? await createClient()

    const [{ data: profile }, { data: catalog }, { data: messages }, { data: suggestions }] = await Promise.all([
        supabase
            .from('offering_profiles')
            .select('summary, manual_profile_note, catalog_enabled, ai_suggestions_enabled')
            .eq('organization_id', options.organizationId)
            .maybeSingle(),
        supabase.from('service_catalog').select('name, aliases, active').eq('organization_id', options.organizationId).eq('active', true),
        supabase
            .from('messages')
            .select('sender_type, content, created_at')
            .eq('conversation_id', options.conversationId)
            .eq('sender_type', 'contact')
            .order('created_at', { ascending: false })
            .limit(5),
        supabase
            .from('offering_profile_suggestions')
            .select('content')
            .eq('organization_id', options.organizationId)
            .eq('status', 'approved')
            .is('archived_at', null)
            .is('update_of', null)
            .order('created_at', { ascending: false })
            .limit(5)
    ])

    if (!process.env.OPENAI_API_KEY) return

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const catalogList = (catalog ?? []).map((row: any) => row.name).join(', ')
    const contextMessages = (messages ?? [])
        .reverse()
        .map((msg: any) => {
            const content = (msg.content ?? '').trim()
            if (!content) return null
            return `customer: ${content}`
        })
        .filter(Boolean) as string[]
    const latestMessage = (options.latestMessage ?? '').trim()
    if (latestMessage && !contextMessages.some((entry) => entry === `customer: ${latestMessage}`)) {
        contextMessages.push(`customer: ${latestMessage}`)
    }
    if (contextMessages.length > 5) {
        contextMessages.splice(0, contextMessages.length - 5)
    }
    const suggestionText = (suggestions ?? [])
        .map((item: any) => `- ${item.content}`)
        .reverse()
        .join('\n')
    const manualProfileNoteText = (profile?.manual_profile_note ?? '').trim()
    const profileText = [
        (profile?.summary ?? '').trim(),
        manualProfileNoteText ? `Manual profile note:\n${manualProfileNoteText}` : '',
        suggestionText ? `AI suggestions:\n${suggestionText}` : ''
    ]
        .filter(Boolean)
        .join('\n\n')

    const userPrompt = [
        `Offering profile:\n${profileText}`,
        `Catalog:${catalogList}`,
        'Customer messages (latest 5, oldest to newest):',
        contextMessages.join('\n')
    ].join('\n\n')

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
        ]
    })

    let response = completion.choices[0]?.message?.content?.trim() ?? '{}'
    let usageTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

    const addUsage = (currentCompletion: typeof completion, prompt: string, output: string) => {
        if (currentCompletion.usage) {
            usageTotals = {
                inputTokens: usageTotals.inputTokens + (currentCompletion.usage.prompt_tokens ?? 0),
                outputTokens: usageTotals.outputTokens + (currentCompletion.usage.completion_tokens ?? 0),
                totalTokens: usageTotals.totalTokens + (currentCompletion.usage.total_tokens ?? ((currentCompletion.usage.prompt_tokens ?? 0) + (currentCompletion.usage.completion_tokens ?? 0)))
            }
        } else {
            const inputTokens = estimateTokenCount(EXTRACTION_SYSTEM_PROMPT) + estimateTokenCount(prompt)
            const outputTokens = estimateTokenCount(output)
            usageTotals = {
                inputTokens: usageTotals.inputTokens + inputTokens,
                outputTokens: usageTotals.outputTokens + outputTokens,
                totalTokens: usageTotals.totalTokens + inputTokens + outputTokens
            }
        }
    }

    addUsage(completion, userPrompt, response)

    if (!hasJsonKey(response, 'score') || !hasJsonKey(response, 'status')) {
        const strictPrompt = `${userPrompt}\n\nReturn JSON with all required keys including score and status.`
        const retry = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            messages: [
                { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
                { role: 'user', content: strictPrompt }
            ]
        })
        response = retry.choices[0]?.message?.content?.trim() ?? response
        addUsage(retry, strictPrompt, response)
    }
    const extracted = safeParseLeadExtraction(response)
    const normalizedExtracted = extracted

    await supabase.from('leads').upsert({
        organization_id: options.organizationId,
        conversation_id: options.conversationId,
        service_type: normalizedExtracted.service_type,
        service_fit: 0,
        intent_score: 0,
        total_score: normalizedExtracted.score,
        status: normalizedExtracted.status,
        non_business: normalizedExtracted.non_business,
        summary: normalizedExtracted.non_business ? null : normalizedExtracted.summary,
        extracted_fields: {
            desired_date: normalizedExtracted.desired_date,
            location: normalizedExtracted.location,
            budget_signals: normalizedExtracted.budget_signals,
            intent_signals: normalizedExtracted.intent_signals,
            risk_signals: normalizedExtracted.risk_signals
        },
        last_message_at: new Date().toISOString()
    }, { onConflict: 'conversation_id' })

    await recordAiUsage({
        organizationId: options.organizationId,
        category: 'lead_extraction',
        model: 'gpt-4o-mini',
        inputTokens: usageTotals.inputTokens,
        outputTokens: usageTotals.outputTokens,
        totalTokens: usageTotals.totalTokens,
        metadata: { conversation_id: options.conversationId, source: options.source },
        supabase
    })
}
