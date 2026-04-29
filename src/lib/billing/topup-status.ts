import type { Json } from '@/types/database'

export interface TopupUsageLedgerRow {
    entry_type: string | null
    credit_pool: string | null
    credits_delta: number | null
    metadata: Json
}

export interface OrganizationTopupStatusSummary {
    consumedTopupCreditsTotal: number
    hasTrialCreditCarryover: boolean
}

interface TopupStatusQueryBuilder {
    select: (columns: string) => TopupStatusQueryBuilder
    eq: (column: string, value: string) => TopupStatusQueryBuilder
    in: (column: string, values: string[]) => TopupStatusQueryBuilder
    then: Promise<{
        data: TopupUsageLedgerRow[] | null
        error: unknown
    }>['then']
}

interface TopupStatusSupabaseLike {
    from: (table: string) => TopupStatusQueryBuilder
}

function readNumericValue(input: unknown): number {
    if (typeof input === 'number' && Number.isFinite(input)) return input
    if (typeof input === 'string') {
        const parsed = Number.parseFloat(input)
        if (Number.isFinite(parsed)) return parsed
    }
    return 0
}

function clampNonNegative(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, value)
}

function readTopupDebitFromMetadata(metadata: Json): number {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') return 0
    return clampNonNegative(readNumericValue((metadata as Record<string, unknown>).topup_debit))
}

function resolveTopupUsageDebit(row: TopupUsageLedgerRow): number {
    if (row.entry_type !== 'usage_debit') return 0

    const fromMetadata = readTopupDebitFromMetadata(row.metadata)
    if (fromMetadata > 0) return fromMetadata

    if (row.credit_pool === 'topup_pool') {
        const creditsDelta = readNumericValue(row.credits_delta)
        return creditsDelta < 0 ? clampNonNegative(Math.abs(creditsDelta)) : 0
    }

    return 0
}

export function sumTopupUsageDebits(rows: TopupUsageLedgerRow[]): number {
    return rows.reduce((sum, row) => sum + resolveTopupUsageDebit(row), 0)
}

export function resolveTopupCreditsTotal(input: {
    currentBalance: number
    consumedCredits: number
    trialCreditLimit: number
    hasTrialCreditCarryover: boolean
}) {
    const reconstructedTopupTotal = clampNonNegative(input.currentBalance) + clampNonNegative(input.consumedCredits)
    if (!input.hasTrialCreditCarryover) return reconstructedTopupTotal

    return Math.max(reconstructedTopupTotal, clampNonNegative(input.trialCreditLimit))
}

function hasTrialCreditCarryover(rows: TopupUsageLedgerRow[]) {
    return rows.some((row) => (
        row.entry_type === 'adjustment'
        && row.credit_pool === 'topup_pool'
        && !Array.isArray(row.metadata)
        && typeof row.metadata === 'object'
        && row.metadata !== null
        && (row.metadata as Record<string, unknown>).source === 'trial_credit_carryover'
    ))
}

export async function getOrganizationTopupStatusSummary(
    organizationId: string,
    supabase: unknown
) : Promise<OrganizationTopupStatusSummary> {
    const client = supabase as TopupStatusSupabaseLike
    const { data, error } = await client
        .from('organization_credit_ledger')
        .select('entry_type, credit_pool, credits_delta, metadata')
        .eq('organization_id', organizationId)
        .in('entry_type', ['usage_debit', 'adjustment'])
        .in('credit_pool', ['topup_pool', 'mixed'])

    if (error) {
        console.error('Failed to load top-up status summary for plans page:', error)
        return {
            consumedTopupCreditsTotal: 0,
            hasTrialCreditCarryover: false
        }
    }

    const rows = (data ?? []) as TopupUsageLedgerRow[]

    return {
        consumedTopupCreditsTotal: sumTopupUsageDebits(rows),
        hasTrialCreditCarryover: hasTrialCreditCarryover(rows)
    }
}
