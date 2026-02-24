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

export interface CreditUsageLedgerRow {
    created_at: string
    credits_delta: number | string
    usage_id?: string | null
    metadata: unknown
}

export interface CreditUsageBreakdown {
    aiReplies: number
    conversationSummary: number
    leadExtraction: number
    documentProcessing: number
}

export interface CreditUsageTotals {
    credits: number
    byCategory: Record<string, number>
    breakdown: CreditUsageBreakdown
    count: number
}

export interface CreditUsageSummary {
    month: string
    timezone: string
    monthly: CreditUsageTotals
    total: CreditUsageTotals
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

interface GetSummaryOptions {
    supabase?: SupabaseClient
}

interface BuildCreditUsageSummaryOptions {
    now?: Date
    timeZone?: string
    categories?: string[]
}

const CREDIT_INPUT_TOKEN_WEIGHT = 1
const CREDIT_OUTPUT_TOKEN_WEIGHT = 4
const TOKENS_PER_CREDIT = 3000
const DEFAULT_USAGE_TIMEZONE = 'Europe/Istanbul'
const DEFAULT_USAGE_CATEGORIES = ['router', 'rag', 'fallback', 'summary', 'lead_extraction', 'lead_reasoning', 'embedding']
const CREDIT_USAGE_LEDGER_PAGE_SIZE = 1000
const USAGE_METADATA_BATCH_SIZE = 200
const DOCUMENT_PROCESSING_SOURCES = new Set([
    'offering_profile_suggestion',
    'service_catalog_candidates',
    'required_intake_fields',
    'required_intake_followup'
])

function normalizeCount(value?: number | null) {
    if (!Number.isFinite(value ?? Number.NaN)) return 0
    return Math.max(0, Math.round(value ?? 0))
}

function normalizeCreditDelta(value?: number | string | null) {
    if (!Number.isFinite(value ?? Number.NaN)) return 0
    const parsed = Number(value ?? 0)
    if (parsed >= 0) return 0
    return Math.abs(parsed)
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

function roundToSingleDecimal(value: number) {
    return Math.round(value * 10) / 10
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function readString(record: Record<string, unknown> | null, key: string) {
    const value = record?.[key]
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function resolveMonthKeyForTimeZone(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit'
    }).formatToParts(date)
    const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
    const month = parts.find((part) => part.type === 'month')?.value ?? '01'
    return `${year}-${month}`
}

function resolveUsageCategory(metadata: unknown) {
    const record = toRecord(metadata)
    const category = record?.category
    return typeof category === 'string' && category.trim().length > 0
        ? category.trim()
        : 'unknown'
}

function resolveUsageSource(metadata: unknown) {
    return readString(toRecord(metadata), 'source')
}

function buildCategoryTotals(categories: string[]) {
    const totals: Record<string, number> = {}
    for (const category of categories) {
        totals[category] = 0
    }
    return totals
}

function buildBreakdownTotals(): CreditUsageBreakdown {
    return {
        aiReplies: 0,
        conversationSummary: 0,
        leadExtraction: 0,
        documentProcessing: 0
    }
}

function withRoundedBreakdown(totals: CreditUsageBreakdown): CreditUsageBreakdown {
    return {
        aiReplies: roundToSingleDecimal(totals.aiReplies),
        conversationSummary: roundToSingleDecimal(totals.conversationSummary),
        leadExtraction: roundToSingleDecimal(totals.leadExtraction),
        documentProcessing: roundToSingleDecimal(totals.documentProcessing)
    }
}

function addToBreakdown(options: {
    totals: CreditUsageBreakdown
    category: string
    source: string | null
    credits: number
}) {
    const { totals, category, source, credits } = options

    if (category === 'router' || category === 'rag' || category === 'fallback') {
        totals.aiReplies += credits
        return
    }

    if (category === 'summary') {
        totals.conversationSummary += credits
        return
    }

    if (category === 'lead_extraction') {
        if (source && DOCUMENT_PROCESSING_SOURCES.has(source)) {
            totals.documentProcessing += credits
            return
        }

        totals.leadExtraction += credits
        return
    }

    if (category === 'lead_reasoning') {
        totals.leadExtraction += credits
    }
}

function withRoundedCategoryTotals(totals: Record<string, number>) {
    const rounded: Record<string, number> = {}
    for (const [category, value] of Object.entries(totals)) {
        rounded[category] = roundToSingleDecimal(value)
    }
    return rounded
}

function splitIntoChunks<T>(values: T[], chunkSize: number) {
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) return [values]

    const chunks: T[][] = []
    for (let index = 0; index < values.length; index += chunkSize) {
        chunks.push(values.slice(index, index + chunkSize))
    }
    return chunks
}

async function loadAllUsageDebitLedgerRows(
    supabase: SupabaseClient,
    organizationId: string
): Promise<CreditUsageLedgerRow[] | null> {
    const rows: CreditUsageLedgerRow[] = []
    let from = 0

    while (true) {
        const to = from + CREDIT_USAGE_LEDGER_PAGE_SIZE - 1
        const { data, error } = await supabase
            .from('organization_credit_ledger')
            .select('created_at, credits_delta, usage_id, metadata')
            .eq('organization_id', organizationId)
            .eq('entry_type', 'usage_debit')
            .order('created_at', { ascending: true })
            .range(from, to)

        if (error) {
            console.error('Failed to load credit usage summary rows:', error)
            return null
        }

        const pageRows = (data ?? []) as CreditUsageLedgerRow[]
        rows.push(...pageRows)

        if (pageRows.length < CREDIT_USAGE_LEDGER_PAGE_SIZE) {
            break
        }

        from += CREDIT_USAGE_LEDGER_PAGE_SIZE
    }

    return rows
}

interface UsageMetadataLookupRow {
    id: string
    metadata: unknown
}

async function loadUsageMetadataByIds(options: {
    supabase: SupabaseClient
    organizationId: string
    usageIds: string[]
}) {
    const usageMetadataById = new Map<string, unknown>()

    for (const usageIdChunk of splitIntoChunks(options.usageIds, USAGE_METADATA_BATCH_SIZE)) {
        const { data, error } = await options.supabase
            .from('organization_ai_usage')
            .select('id, metadata')
            .eq('organization_id', options.organizationId)
            .in('id', usageIdChunk)

        if (error) {
            console.error('Failed to load AI usage metadata for credit breakdown:', error)
            continue
        }

        for (const row of (data ?? []) as UsageMetadataLookupRow[]) {
            usageMetadataById.set(row.id, row.metadata)
        }
    }

    return usageMetadataById
}

export function buildCreditUsageSummary(
    rows: CreditUsageLedgerRow[],
    options?: BuildCreditUsageSummaryOptions
): CreditUsageSummary {
    const timeZone = options?.timeZone ?? DEFAULT_USAGE_TIMEZONE
    const now = options?.now ?? new Date()
    const monthKey = resolveMonthKeyForTimeZone(now, timeZone)
    const categories = options?.categories ?? DEFAULT_USAGE_CATEGORIES

    const monthlyByCategory = buildCategoryTotals(categories)
    const totalByCategory = buildCategoryTotals(categories)
    const monthlyBreakdown = buildBreakdownTotals()
    const totalBreakdown = buildBreakdownTotals()
    let monthlyCredits = 0
    let totalCredits = 0
    let monthlyCount = 0
    let totalCount = 0

    for (const row of rows) {
        const credits = normalizeCreditDelta(row.credits_delta)
        if (credits <= 0) continue

        const createdAt = new Date(row.created_at)
        if (!Number.isFinite(createdAt.getTime())) continue

        const category = resolveUsageCategory(row.metadata)
        const source = resolveUsageSource(row.metadata)
        if (!(category in totalByCategory)) {
            totalByCategory[category] = 0
        }

        totalByCategory[category] = (totalByCategory[category] ?? 0) + credits
        addToBreakdown({
            totals: totalBreakdown,
            category,
            source,
            credits
        })
        totalCredits += credits
        totalCount += 1

        if (resolveMonthKeyForTimeZone(createdAt, timeZone) === monthKey) {
            if (!(category in monthlyByCategory)) {
                monthlyByCategory[category] = 0
            }

            monthlyByCategory[category] = (monthlyByCategory[category] ?? 0) + credits
            addToBreakdown({
                totals: monthlyBreakdown,
                category,
                source,
                credits
            })
            monthlyCredits += credits
            monthlyCount += 1
        }
    }

    return {
        month: monthKey,
        timezone: timeZone,
        monthly: {
            credits: roundToSingleDecimal(monthlyCredits),
            byCategory: withRoundedCategoryTotals(monthlyByCategory),
            breakdown: withRoundedBreakdown(monthlyBreakdown),
            count: monthlyCount
        },
        total: {
            credits: roundToSingleDecimal(totalCredits),
            byCategory: withRoundedCategoryTotals(totalByCategory),
            breakdown: withRoundedBreakdown(totalBreakdown),
            count: totalCount
        }
    }
}

export async function getOrgCreditUsageSummary(
    organizationId: string,
    options?: GetSummaryOptions & {
        now?: Date
        timeZone?: string
    }
): Promise<CreditUsageSummary> {
    const supabase = options?.supabase ?? await createClient()

    const ledgerRows = await loadAllUsageDebitLedgerRows(supabase, organizationId)
    if (!ledgerRows) {
        return buildCreditUsageSummary([], {
            now: options?.now,
            timeZone: options?.timeZone
        })
    }

    const usageIds = Array.from(
        new Set(
            ledgerRows
                .map((row) => row.usage_id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
    )
    const usageMetadataById = usageIds.length > 0
        ? await loadUsageMetadataByIds({
            supabase,
            organizationId,
            usageIds
        })
        : new Map<string, unknown>()

    const normalizedRows = ledgerRows.map((row) => {
        const ledgerMetadata = toRecord(row.metadata) ?? {}
        const usageMetadata = row.usage_id ? toRecord(usageMetadataById.get(row.usage_id) ?? null) : null

        return {
            created_at: row.created_at,
            credits_delta: row.credits_delta,
            metadata: {
                ...ledgerMetadata,
                ...(usageMetadata ? { source: readString(usageMetadata, 'source') } : {})
            }
        } satisfies CreditUsageLedgerRow
    })

    return buildCreditUsageSummary(normalizedRows, {
        now: options?.now,
        timeZone: options?.timeZone
    })
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
