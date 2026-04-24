'use server'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type {
    BillingCreditLedgerType,
    BillingCreditPoolType,
    OrganizationBillingAccount
} from '@/types/database'
import { buildOrganizationBillingSnapshot, type OrganizationBillingSnapshot } from '@/lib/billing/snapshot'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

function isMissingBillingTableError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const candidate = error as { code?: string | null; message?: string | null }
    if (candidate.code === '42P01') return true

    return typeof candidate.message === 'string'
        && (
            candidate.message.includes('organization_billing_accounts')
            || candidate.message.includes('organization_credit_ledger')
        )
}

export interface BillingLedgerEntry {
    id: string
    entryType: BillingCreditLedgerType
    creditPool: BillingCreditPoolType
    creditsDelta: number
    balanceAfter: number
    reason: string | null
    metadata: unknown
    createdAt: string
}

export type BillingLedgerPeriodFilter = 'current_month' | 'previous_month' | 'all'
export type BillingLedgerMovementFilter = 'all' | 'usage' | 'loads'
export type BillingLedgerAggregateView = 'day' | 'week' | 'month'

export interface BillingLedgerPage {
    entries: BillingLedgerEntry[]
    hasMore: boolean
    nextOffset: number | null
}

const BILLING_LEDGER_MAX_PAGE_SIZE = 100
const BILLING_LEDGER_WINDOW_FETCH_SIZE = 1000
const ISTANBUL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function normalizeBillingLedgerPageSize(value: number | undefined) {
    return Number.isFinite(value)
        ? Math.max(1, Math.min(BILLING_LEDGER_MAX_PAGE_SIZE, Math.floor(value as number)))
        : 25
}

function normalizeBillingLedgerOffset(value: number | undefined) {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0
}

function normalizeBillingLedgerAggregateOffset(value: number | undefined) {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0
}

function resolveAggregateWindowSize(view: BillingLedgerAggregateView) {
    return view === 'day' ? 10 : 3
}

function resolveIstanbulMonthBounds(period: Exclude<BillingLedgerPeriodFilter, 'all'>, now: Date) {
    const istanbulNow = new Date(now.getTime() + ISTANBUL_UTC_OFFSET_MS)
    const year = istanbulNow.getUTCFullYear()
    const monthIndex = istanbulNow.getUTCMonth() + (period === 'previous_month' ? -1 : 0)
    const start = new Date(Date.UTC(year, monthIndex, 1) - ISTANBUL_UTC_OFFSET_MS)
    const end = new Date(Date.UTC(year, monthIndex + 1, 1) - ISTANBUL_UTC_OFFSET_MS)

    return {
        startIso: start.toISOString(),
        endIso: end.toISOString()
    }
}

function resolveIstanbulDayStart(now: Date) {
    const istanbulNow = new Date(now.getTime() + ISTANBUL_UTC_OFFSET_MS)
    return new Date(Date.UTC(
        istanbulNow.getUTCFullYear(),
        istanbulNow.getUTCMonth(),
        istanbulNow.getUTCDate()
    ) - ISTANBUL_UTC_OFFSET_MS)
}

function resolveIstanbulAggregatePeriodEnd(view: BillingLedgerAggregateView, now: Date) {
    if (view === 'day') {
        return new Date(resolveIstanbulDayStart(now).getTime() + DAY_MS)
    }

    const dayStart = resolveIstanbulDayStart(now)

    if (view === 'week') {
        const istanbulDayStart = new Date(dayStart.getTime() + ISTANBUL_UTC_OFFSET_MS)
        const utcDay = istanbulDayStart.getUTCDay()
        const daysSinceMonday = utcDay === 0 ? 6 : utcDay - 1
        const weekStart = new Date(dayStart.getTime() - (daysSinceMonday * DAY_MS))
        return new Date(weekStart.getTime() + (7 * DAY_MS))
    }

    const istanbulNow = new Date(now.getTime() + ISTANBUL_UTC_OFFSET_MS)
    return new Date(Date.UTC(
        istanbulNow.getUTCFullYear(),
        istanbulNow.getUTCMonth() + 1,
        1
    ) - ISTANBUL_UTC_OFFSET_MS)
}

function shiftIstanbulAggregateBoundary(
    boundary: Date,
    view: BillingLedgerAggregateView,
    amount: number
) {
    if (view === 'day') return new Date(boundary.getTime() + (amount * DAY_MS))
    if (view === 'week') return new Date(boundary.getTime() + (amount * 7 * DAY_MS))

    const localBoundary = new Date(boundary.getTime() + ISTANBUL_UTC_OFFSET_MS)
    return new Date(Date.UTC(
        localBoundary.getUTCFullYear(),
        localBoundary.getUTCMonth() + amount,
        1
    ) - ISTANBUL_UTC_OFFSET_MS)
}

function resolveIstanbulAggregateWindowBounds(input: {
    period: BillingLedgerPeriodFilter
    view: BillingLedgerAggregateView
    offset: number
    now: Date
}) {
    const windowSize = resolveAggregateWindowSize(input.view)
    const latestPeriodEnd = resolveIstanbulAggregatePeriodEnd(input.view, input.now)
    const periodBounds = input.period === 'all'
        ? null
        : resolveIstanbulMonthBounds(input.period, input.now)
    const periodStart = periodBounds ? new Date(periodBounds.startIso) : null
    const periodEnd = periodBounds ? new Date(periodBounds.endIso) : null
    const baseEnd = periodEnd && periodEnd.getTime() < latestPeriodEnd.getTime()
        ? periodEnd
        : latestPeriodEnd
    const windowEnd = shiftIstanbulAggregateBoundary(baseEnd, input.view, -input.offset)
    const rawWindowStart = shiftIstanbulAggregateBoundary(windowEnd, input.view, -windowSize)

    return {
        startIso: rawWindowStart.toISOString(),
        endIso: windowEnd.toISOString(),
        hasPreviousWindow: periodStart
            ? rawWindowStart.getTime() > periodStart.getTime()
            : true,
        nextOffset: input.offset + windowSize
    }
}

function applyBillingLedgerMovementFilter<TQuery extends {
    lt: (column: string, value: number) => TQuery
    gt: (column: string, value: number) => TQuery
}>(
    query: TQuery,
    movement: BillingLedgerMovementFilter | undefined
) {
    if (movement === 'usage') return query.lt('credits_delta', 0)
    if (movement === 'loads') return query.gt('credits_delta', 0)
    return query
}

function mapBillingLedgerEntries(data: Array<{
    id: string
    entry_type: BillingCreditLedgerType
    credit_pool: BillingCreditPoolType
    credits_delta: number | string | null
    balance_after: number | string | null
    reason: string | null
    metadata: unknown
    created_at: string
}>): BillingLedgerEntry[] {
    return data.map((entry) => ({
        id: entry.id,
        entryType: entry.entry_type,
        creditPool: entry.credit_pool,
        creditsDelta: Number(entry.credits_delta ?? 0),
        balanceAfter: Number(entry.balance_after ?? 0),
        reason: entry.reason,
        metadata: entry.metadata,
        createdAt: entry.created_at
    }))
}

export async function getOrganizationBillingSnapshot(
    organizationId: string,
    options?: { supabase?: SupabaseClient }
): Promise<OrganizationBillingSnapshot | null> {
    if (!options?.supabase) {
        return getOrganizationBillingSnapshotCached(organizationId)
    }

    return getOrganizationBillingSnapshotWithSupabase(options.supabase, organizationId)
}

const getOrganizationBillingSnapshotCached = cache(async (organizationId: string) => {
    const supabase = await createClient()
    return getOrganizationBillingSnapshotWithSupabase(supabase, organizationId)
})

async function getOrganizationBillingSnapshotWithSupabase(
    supabase: SupabaseClient,
    organizationId: string
): Promise<OrganizationBillingSnapshot | null> {
    const { data, error } = await supabase
        .from('organization_billing_accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()

    if (error) {
        if (!isMissingBillingTableError(error)) {
            console.error('Failed to load organization billing snapshot:', error)
        }
        return null
    }

    if (!data) return null
    return buildOrganizationBillingSnapshot(data as OrganizationBillingAccount)
}

export async function getOrganizationBillingLedger(
    organizationId: string,
    options?: {
        entryTypes?: BillingCreditLedgerType[]
        limit?: number
        supabase?: SupabaseClient
    }
): Promise<BillingLedgerEntry[]> {
    const supabase = options?.supabase ?? await createClient()
    const limit = Number.isFinite(options?.limit) ? Math.max(1, Math.min(100, Math.floor(options?.limit as number))) : 15

    let query = supabase
        .from('organization_credit_ledger')
        .select('id, entry_type, credit_pool, credits_delta, balance_after, reason, metadata, created_at')
        .eq('organization_id', organizationId)

    if (options?.entryTypes?.length) {
        query = query.in('entry_type', options.entryTypes)
    }

    const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        if (!isMissingBillingTableError(error)) {
            console.error('Failed to load organization billing ledger:', error)
        }
        return []
    }

    return mapBillingLedgerEntries(data ?? [])
}

export async function getOrganizationBillingLedgerPage(
    organizationId: string,
    options?: {
        entryTypes?: BillingCreditLedgerType[]
        limit?: number
        offset?: number
        period?: BillingLedgerPeriodFilter
        movement?: BillingLedgerMovementFilter
        now?: Date
        supabase?: SupabaseClient
    }
): Promise<BillingLedgerPage> {
    const supabase = options?.supabase ?? await createClient()
    const limit = normalizeBillingLedgerPageSize(options?.limit)
    const offset = normalizeBillingLedgerOffset(options?.offset)
    const period = options?.period ?? 'current_month'

    let query = supabase
        .from('organization_credit_ledger')
        .select('id, entry_type, credit_pool, credits_delta, balance_after, reason, metadata, created_at')
        .eq('organization_id', organizationId)

    if (options?.entryTypes?.length) {
        query = query.in('entry_type', options.entryTypes)
    }

    query = applyBillingLedgerMovementFilter(query, options?.movement)

    if (period !== 'all') {
        const bounds = resolveIstanbulMonthBounds(period, options?.now ?? new Date())
        query = query
            .gte('created_at', bounds.startIso)
            .lt('created_at', bounds.endIso)
    }

    const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit)

    if (error) {
        if (!isMissingBillingTableError(error)) {
            console.error('Failed to load organization billing ledger page:', error)
        }
        return {
            entries: [],
            hasMore: false,
            nextOffset: null
        }
    }

    const pageRows = (data ?? []).slice(0, limit)

    return {
        entries: mapBillingLedgerEntries(pageRows),
        hasMore: (data ?? []).length > limit,
        nextOffset: (data ?? []).length > limit ? offset + limit : null
    }
}

export async function getOrganizationBillingLedgerWindow(
    organizationId: string,
    options: {
        period: BillingLedgerPeriodFilter
        movement?: BillingLedgerMovementFilter
        view: BillingLedgerAggregateView
        offset?: number
        now?: Date
        supabase?: SupabaseClient
    }
): Promise<BillingLedgerPage> {
    const supabase = options.supabase ?? await createClient()
    const offset = normalizeBillingLedgerAggregateOffset(options.offset)
    const bounds = resolveIstanbulAggregateWindowBounds({
        period: options.period,
        view: options.view,
        offset,
        now: options.now ?? new Date()
    })
    let query = supabase
        .from('organization_credit_ledger')
        .select('id, entry_type, credit_pool, credits_delta, balance_after, reason, metadata, created_at')
        .eq('organization_id', organizationId)

    query = applyBillingLedgerMovementFilter(query, options.movement)
    query = query
        .gte('created_at', bounds.startIso)
        .lt('created_at', bounds.endIso)

    const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(0, BILLING_LEDGER_WINDOW_FETCH_SIZE - 1)

    if (error) {
        if (!isMissingBillingTableError(error)) {
            console.error('Failed to load organization billing ledger aggregate window:', error)
        }
        return {
            entries: [],
            hasMore: false,
            nextOffset: null
        }
    }

    const entries = mapBillingLedgerEntries(data ?? [])

    return {
        entries,
        hasMore: options.period === 'all' ? entries.length > 0 : bounds.hasPreviousWindow,
        nextOffset: options.period === 'all' || bounds.hasPreviousWindow ? bounds.nextOffset : null
    }
}
