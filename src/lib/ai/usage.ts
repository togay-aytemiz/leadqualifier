'use server'

import { createClient } from '@/lib/supabase/server'

export type AiUsageCategory = 'router' | 'rag' | 'fallback' | 'summary' | 'lead_extraction' | 'lead_reasoning'

export interface AiUsageTotals {
    inputTokens: number
    outputTokens: number
    totalTokens: number
}

export interface AiUsageSummary {
    month: string
    timezone: 'UTC'
    monthly: AiUsageTotals
    total: AiUsageTotals
    monthlyByCategory: Record<string, AiUsageTotals>
    totalByCategory: Record<string, AiUsageTotals>
    monthlyCount: number
    totalCount: number
}

interface RecordAiUsageInput {
    organizationId: string
    category: AiUsageCategory
    model: string
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    metadata?: Record<string, any>
    supabase?: any
}

function clampTokens(value?: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.round(value ?? 0))
}

function normalizeTokenCounts(inputTokens?: number, outputTokens?: number, totalTokens?: number) {
    const input = clampTokens(inputTokens)
    const output = clampTokens(outputTokens)
    const total = clampTokens(totalTokens ?? input + output)
    return { input, output, total }
}

export async function recordAiUsage({
    organizationId,
    category,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    metadata,
    supabase
}: RecordAiUsageInput) {
    const client = supabase ?? await createClient()
    const tokens = normalizeTokenCounts(inputTokens, outputTokens, totalTokens)

    try {
        const { error } = await client
            .from('organization_ai_usage')
            .insert({
                organization_id: organizationId,
                category,
                model,
                input_tokens: tokens.input,
                output_tokens: tokens.output,
                total_tokens: tokens.total,
                metadata: metadata ?? {}
            })

        if (error) {
            console.error('Failed to record AI usage:', error)
        }
    } catch (error) {
        console.error('Failed to record AI usage:', error)
    }
}

function sumUsage(rows: Array<{ input_tokens: number; output_tokens: number; total_tokens: number }>): AiUsageTotals {
    return rows.reduce(
        (acc, row) => {
            acc.inputTokens += row.input_tokens ?? 0
            acc.outputTokens += row.output_tokens ?? 0
            acc.totalTokens += row.total_tokens ?? 0
            return acc
        },
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    )
}

function sumUsageByCategory(
    rows: Array<{ category: string; input_tokens: number; output_tokens: number; total_tokens: number }>,
    categories: string[]
) {
    const totals: Record<string, AiUsageTotals> = {}
    categories.forEach((category) => {
        totals[category] = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    })

    for (const row of rows) {
        const key = row.category
        if (!totals[key]) {
            totals[key] = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        }
        totals[key].inputTokens += row.input_tokens ?? 0
        totals[key].outputTokens += row.output_tokens ?? 0
        totals[key].totalTokens += row.total_tokens ?? 0
    }

    return totals
}

export async function getOrgAiUsageSummary(organizationId: string, options?: { supabase?: any }): Promise<AiUsageSummary> {
    const supabase = options?.supabase ?? await createClient()

    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const monthKey = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`
    const categories: string[] = ['router', 'rag', 'fallback', 'summary', 'lead_extraction']

    const [monthlyResult, totalResult] = await Promise.all([
        supabase
            .from('organization_ai_usage')
            .select('category, input_tokens, output_tokens, total_tokens')
            .eq('organization_id', organizationId)
            .gte('created_at', monthStart.toISOString())
            .lt('created_at', monthEnd.toISOString()),
        supabase
            .from('organization_ai_usage')
            .select('category, input_tokens, output_tokens, total_tokens')
            .eq('organization_id', organizationId)
    ])

    if (monthlyResult.error) {
        console.error('Failed to load monthly AI usage:', monthlyResult.error)
    }

    if (totalResult.error) {
        console.error('Failed to load total AI usage:', totalResult.error)
    }

    const monthlyRows = (monthlyResult.data ?? []) as Array<{ category: string; input_tokens: number; output_tokens: number; total_tokens: number }>
    const totalRows = (totalResult.data ?? []) as Array<{ category: string; input_tokens: number; output_tokens: number; total_tokens: number }>

    return {
        month: monthKey,
        timezone: 'UTC',
        monthly: sumUsage(monthlyRows),
        total: sumUsage(totalRows),
        monthlyByCategory: sumUsageByCategory(monthlyRows, categories),
        totalByCategory: sumUsageByCategory(totalRows, categories),
        monthlyCount: monthlyRows.length,
        totalCount: totalRows.length
    }
}
