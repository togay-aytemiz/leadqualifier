import { createClient } from '@/lib/supabase/server'

export interface MessageUsageCounts {
    aiGenerated: number
    operatorSent: number
    incoming: number
}

export interface MessageUsageTotals extends MessageUsageCounts {
    totalMessages: number
}

export interface MessageUsageSummary {
    month: string
    timezone: 'UTC'
    monthly: MessageUsageTotals
    total: MessageUsageTotals
}

export interface SkillStorageRow {
    title: string | null
    response_text: string | null
    trigger_examples: string[] | null
}

export interface KnowledgeStorageRow {
    title: string | null
    content: string | null
}

export interface StorageUsageSummary {
    totalBytes: number
    skillsBytes: number
    knowledgeBytes: number
    skillCount: number
    knowledgeDocumentCount: number
}

export interface FormattedStorageSize {
    value: string
    unit: 'B' | 'KB' | 'MB' | 'GB'
}

export interface AiTokenTotalsLike {
    inputTokens: number
    outputTokens: number
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

interface GetSummaryOptions {
    supabase?: SupabaseClient
}

const CREDIT_INPUT_TOKEN_WEIGHT = 1
const CREDIT_OUTPUT_TOKEN_WEIGHT = 4
const TOKENS_PER_CREDIT = 3000

function normalizeCount(value?: number | null) {
    if (!Number.isFinite(value ?? Number.NaN)) return 0
    return Math.max(0, Math.round(value ?? 0))
}

function getUtf8ByteSize(value: string | null | undefined) {
    return Buffer.byteLength((value ?? '').toString(), 'utf8')
}

function getStringArrayByteSize(values: string[] | null | undefined) {
    if (!Array.isArray(values)) return 0
    return values.reduce((total, value) => total + getUtf8ByteSize(value), 0)
}

function ceilToSingleDecimal(value: number) {
    return Math.ceil(value * 10) / 10
}

export function calculateAiCreditsFromTokens(totals: AiTokenTotalsLike) {
    const inputTokens = normalizeCount(totals.inputTokens)
    const outputTokens = normalizeCount(totals.outputTokens)
    const weightedTokens =
        (inputTokens * CREDIT_INPUT_TOKEN_WEIGHT)
        + (outputTokens * CREDIT_OUTPUT_TOKEN_WEIGHT)

    if (weightedTokens <= 0) return 0
    return ceilToSingleDecimal(weightedTokens / TOKENS_PER_CREDIT)
}

export function formatCreditAmount(credits: number, locale: string = 'en') {
    const safeCredits = Math.max(0, Number.isFinite(credits) ? credits : 0)
    return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format(safeCredits)
}

export function buildMessageUsageTotals(counts: MessageUsageCounts): MessageUsageTotals {
    const aiGenerated = normalizeCount(counts.aiGenerated)
    const operatorSent = normalizeCount(counts.operatorSent)
    const incoming = normalizeCount(counts.incoming)

    return {
        aiGenerated,
        operatorSent,
        incoming,
        totalMessages: aiGenerated + operatorSent + incoming
    }
}

export function calculateSkillStorageBytes(rows: SkillStorageRow[]) {
    return rows.reduce(
        (total, row) => total
            + getUtf8ByteSize(row.title)
            + getUtf8ByteSize(row.response_text)
            + getStringArrayByteSize(row.trigger_examples),
        0
    )
}

export function calculateKnowledgeStorageBytes(rows: KnowledgeStorageRow[]) {
    return rows.reduce(
        (total, row) => total + getUtf8ByteSize(row.title) + getUtf8ByteSize(row.content),
        0
    )
}

export function formatStorageSize(bytes: number, locale: string = 'en'): FormattedStorageSize {
    const safeBytes = Math.max(0, Number.isFinite(bytes) ? bytes : 0)
    const units: Array<'B' | 'KB' | 'MB' | 'GB'> = ['B', 'KB', 'MB', 'GB']

    let value = safeBytes
    let unitIndex = 0

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex += 1
    }

    const isBytes = unitIndex === 0
    const formatter = new Intl.NumberFormat(locale, {
        minimumFractionDigits: isBytes ? 0 : 2,
        maximumFractionDigits: isBytes ? 0 : 2
    })

    return {
        value: formatter.format(isBytes ? Math.round(value) : value),
        unit: units[unitIndex] ?? 'B'
    }
}

async function countMessagesBySenderType(options: {
    supabase: SupabaseClient
    organizationId: string
    senderType: 'bot' | 'user' | 'contact'
    createdAtGte?: string
    createdAtLt?: string
}) {
    const { supabase, organizationId, senderType, createdAtGte, createdAtLt } = options

    let query = supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('sender_type', senderType)

    if (createdAtGte && createdAtLt) {
        query = query.gte('created_at', createdAtGte).lt('created_at', createdAtLt)
    }

    const { count, error } = await query

    if (error) {
        console.error(`Failed to load message usage for sender type \"${senderType}\":`, error)
    }

    return normalizeCount(count)
}

export async function getOrgMessageUsageSummary(
    organizationId: string,
    options?: GetSummaryOptions
): Promise<MessageUsageSummary> {
    const supabase = options?.supabase ?? await createClient()

    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const monthKey = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`

    const [
        monthlyAiGenerated,
        monthlyOperatorSent,
        monthlyIncoming,
        totalAiGenerated,
        totalOperatorSent,
        totalIncoming
    ] = await Promise.all([
        countMessagesBySenderType({
            supabase,
            organizationId,
            senderType: 'bot',
            createdAtGte: monthStart.toISOString(),
            createdAtLt: monthEnd.toISOString()
        }),
        countMessagesBySenderType({
            supabase,
            organizationId,
            senderType: 'user',
            createdAtGte: monthStart.toISOString(),
            createdAtLt: monthEnd.toISOString()
        }),
        countMessagesBySenderType({
            supabase,
            organizationId,
            senderType: 'contact',
            createdAtGte: monthStart.toISOString(),
            createdAtLt: monthEnd.toISOString()
        }),
        countMessagesBySenderType({
            supabase,
            organizationId,
            senderType: 'bot'
        }),
        countMessagesBySenderType({
            supabase,
            organizationId,
            senderType: 'user'
        }),
        countMessagesBySenderType({
            supabase,
            organizationId,
            senderType: 'contact'
        })
    ])

    return {
        month: monthKey,
        timezone: 'UTC',
        monthly: buildMessageUsageTotals({
            aiGenerated: monthlyAiGenerated,
            operatorSent: monthlyOperatorSent,
            incoming: monthlyIncoming
        }),
        total: buildMessageUsageTotals({
            aiGenerated: totalAiGenerated,
            operatorSent: totalOperatorSent,
            incoming: totalIncoming
        })
    }
}

export async function getOrgStorageUsageSummary(
    organizationId: string,
    options?: GetSummaryOptions
): Promise<StorageUsageSummary> {
    const supabase = options?.supabase ?? await createClient()

    const [skillsResult, knowledgeResult] = await Promise.all([
        supabase
            .from('skills')
            .select('title, response_text, trigger_examples')
            .eq('organization_id', organizationId),
        supabase
            .from('knowledge_documents')
            .select('title, content')
            .eq('organization_id', organizationId)
    ])

    if (skillsResult.error) {
        console.error('Failed to load skill storage usage:', skillsResult.error)
    }

    if (knowledgeResult.error) {
        console.error('Failed to load knowledge storage usage:', knowledgeResult.error)
    }

    const skillsRows = (skillsResult.data ?? []) as SkillStorageRow[]
    const knowledgeRows = (knowledgeResult.data ?? []) as KnowledgeStorageRow[]

    const skillsBytes = calculateSkillStorageBytes(skillsRows)
    const knowledgeBytes = calculateKnowledgeStorageBytes(knowledgeRows)

    return {
        totalBytes: skillsBytes + knowledgeBytes,
        skillsBytes,
        knowledgeBytes,
        skillCount: skillsRows.length,
        knowledgeDocumentCount: knowledgeRows.length
    }
}
