import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { scoreLead } from '@/lib/leads/scoring'
import { recordAiUsage } from '@/lib/ai/usage'

const EXTRACTION_SYSTEM_PROMPT = `Extract lead signals as JSON.
Return keys: service_type, desired_date, location, budget_signals, intent_signals, risk_signals, non_business, summary.
Use nulls if unknown. Use non_business=true only for personal/social conversations.`

export function safeParseLeadExtraction(input: string) {
    try {
        const parsed = JSON.parse(input)
        return {
            service_type: parsed.service_type ?? null,
            desired_date: parsed.desired_date ?? null,
            location: parsed.location ?? null,
            budget_signals: parsed.budget_signals ?? [],
            intent_signals: parsed.intent_signals ?? [],
            risk_signals: parsed.risk_signals ?? [],
            non_business: Boolean(parsed.non_business),
            summary: parsed.summary ?? null
        }
    } catch {
        return {
            service_type: null,
            desired_date: null,
            location: null,
            budget_signals: [],
            intent_signals: [],
            risk_signals: [],
            non_business: false,
            summary: null
        }
    }
}

function normalizeValue(value: string) {
    return value.trim().toLowerCase()
}

function matchesCatalog(serviceType: string | null, catalog: Array<{ name: string; aliases?: string[] }>) {
    if (!serviceType) return false
    const normalized = normalizeValue(serviceType)
    return catalog.some((item) => {
        if (normalizeValue(item.name) === normalized) return true
        const aliases = item.aliases ?? []
        return aliases.some((alias) => normalizeValue(alias) === normalized)
    })
}

export async function runLeadExtraction(options: {
    organizationId: string
    conversationId: string
    latestMessage?: string
    supabase?: any
    source?: 'telegram' | 'whatsapp'
}) {
    const supabase = options.supabase ?? await createClient()

    const [{ data: profile }, { data: catalog }, { data: messages }] = await Promise.all([
        supabase.from('offering_profiles').select('summary, catalog_enabled').eq('organization_id', options.organizationId).maybeSingle(),
        supabase.from('service_catalog').select('name, aliases, active').eq('organization_id', options.organizationId).eq('active', true),
        supabase.from('messages').select('sender_type, content, created_at').eq('conversation_id', options.conversationId).order('created_at', { ascending: false }).limit(10)
    ])

    if (!process.env.OPENAI_API_KEY) return

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const catalogList = (catalog ?? []).map((row: any) => row.name).join(', ')
    const contextMessages = (messages ?? []).reverse().map((msg: any) => `${msg.sender_type}: ${msg.content}`)
    const userPrompt = `Offering profile:\n${profile?.summary ?? ''}\n\nCatalog:${catalogList}\n\nConversation:\n${contextMessages.join('\n')}`

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
        ]
    })

    const response = completion.choices[0]?.message?.content?.trim() ?? '{}'
    const extracted = safeParseLeadExtraction(response)

    const catalogEnabled = profile?.catalog_enabled ?? true
    const hasCatalogMatch = catalogEnabled && matchesCatalog(extracted.service_type, catalog ?? [])

    const signals = {
        hasCatalogMatch,
        hasProfileMatch: Boolean(profile?.summary),
        hasDate: Boolean(extracted.desired_date),
        hasBudget: Array.isArray(extracted.budget_signals) && extracted.budget_signals.length > 0,
        isDecisive: Array.isArray(extracted.intent_signals) && extracted.intent_signals.includes('decisive'),
        isUrgent: Array.isArray(extracted.intent_signals) && extracted.intent_signals.includes('urgent'),
        isIndecisive: Array.isArray(extracted.intent_signals) && extracted.intent_signals.includes('indecisive'),
        isFarFuture: Array.isArray(extracted.intent_signals) && extracted.intent_signals.includes('far_future'),
        nonBusiness: extracted.non_business
    }

    const scored = scoreLead(signals)

    await supabase.from('leads').upsert({
        organization_id: options.organizationId,
        conversation_id: options.conversationId,
        service_type: extracted.service_type,
        service_fit: scored.serviceFit,
        intent_score: scored.intentScore,
        total_score: scored.totalScore,
        status: scored.status,
        non_business: extracted.non_business,
        summary: extracted.non_business ? null : extracted.summary,
        extracted_fields: {
            desired_date: extracted.desired_date,
            location: extracted.location,
            budget_signals: extracted.budget_signals,
            intent_signals: extracted.intent_signals,
            risk_signals: extracted.risk_signals
        },
        last_message_at: new Date().toISOString()
    }, { onConflict: 'conversation_id' })

    if (completion.usage) {
        await recordAiUsage({
            organizationId: options.organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: completion.usage.prompt_tokens ?? 0,
            outputTokens: completion.usage.completion_tokens ?? 0,
            totalTokens: completion.usage.total_tokens ?? 0,
            metadata: { conversation_id: options.conversationId, source: options.source },
            supabase
        })
    } else {
        await recordAiUsage({
            organizationId: options.organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: estimateTokenCount(EXTRACTION_SYSTEM_PROMPT) + estimateTokenCount(userPrompt),
            outputTokens: estimateTokenCount(response),
            totalTokens: estimateTokenCount(EXTRACTION_SYSTEM_PROMPT) + estimateTokenCount(userPrompt) + estimateTokenCount(response),
            metadata: { conversation_id: options.conversationId, source: options.source },
            supabase
        })
    }
}
