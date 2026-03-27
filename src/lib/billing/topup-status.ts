import type { Json } from '@/types/database'

export interface TopupUsageLedgerRow {
    credit_pool: string | null
    credits_delta: number | null
    metadata: Json
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
}) {
    return clampNonNegative(input.currentBalance) + clampNonNegative(input.consumedCredits)
}

export async function getOrganizationTopupConsumedCreditsTotal(
    organizationId: string,
    supabase: { from: (table: string) => any }
) {
    const { data, error } = await supabase
        .from('organization_credit_ledger')
        .select('credit_pool, credits_delta, metadata')
        .eq('organization_id', organizationId)
        .eq('entry_type', 'usage_debit')
        .in('credit_pool', ['topup_pool', 'mixed'])

    if (error) {
        console.error('Failed to load consumed top-up credits total for plans page:', error)
        return 0
    }

    return sumTopupUsageDebits(data ?? [])
}
