import { createClient } from '@/lib/supabase/server'
import type {
    BillingAdminAuditLog,
    BillingLockReason,
    BillingMembershipState,
    Json,
    OrganizationBillingAccount
} from '@/types/database'
import { buildOrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import {
    resolveMonthlySubscriptionAmountTry,
    resolveTopupUsageDebit
} from '@/lib/admin/billing-plan-metrics'
import {
    ADMIN_METRIC_PERIOD_ALL,
    resolveAdminMetricPeriodKey,
    resolveAdminMetricPeriodRange
} from '@/lib/admin/dashboard-metric-period'
import { summarizeUsageMetricRows } from '@/lib/admin/dashboard-usage-metrics'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface AdminOrganizationSummary {
    id: string
    name: string
    slug: string
    createdAt: string
    memberCount: number
    profileCount: number
    skillCount: number
    knowledgeDocumentCount: number
    totalMessageCount: number
    totalTokenCount: number
    billing: AdminBillingSnapshot
}

export interface AdminBillingSnapshot {
    membershipState: BillingMembershipState | null
    lockReason: BillingLockReason | null
    isUsageAllowed: boolean
    isTopupAllowed: boolean
    trialEndsAt: string | null
    currentPeriodEnd: string | null
    trialCreditsUsed: number
    trialCreditsLimit: number
    trialCreditsRemaining: number
    packageCreditsUsed: number
    packageCreditsLimit: number
    packageCreditsRemaining: number
    topupCreditsRemaining: number
}

export interface AdminUserOrganizationMembership {
    organizationId: string
    organizationName: string
    organizationSlug: string
    role: string
}

export interface AdminUserSummary {
    id: string
    fullName: string | null
    email: string | null
    createdAt: string
    isSystemAdmin: boolean
    organizationCount: number
    organizations: AdminUserOrganizationMembership[]
}

export interface AdminUserDetail {
    user: AdminUserSummary
    organizationSnapshots: Array<AdminOrganizationSummary & { role: string }>
}

export interface AdminOrganizationProfileSnapshot {
    userId: string
    fullName: string | null
    email: string | null
    isSystemAdmin: boolean
    role: string
    joinedAt: string
    organizationCount: number
    organizations: AdminUserOrganizationMembership[]
}

export interface AdminOrganizationDetail {
    organization: AdminOrganizationSummary
    profiles: AdminOrganizationProfileSnapshot[]
    billingAuditEntries: AdminBillingAuditEntry[]
}

export interface AdminBillingAuditEntry {
    id: string
    actionType: BillingAdminAuditLog['action_type']
    actorId: string
    actorName: string | null
    actorEmail: string | null
    reason: string
    beforeState: Json
    afterState: Json
    metadata: Json
    createdAt: string
}

export interface AdminOrganizationListResult {
    items: AdminOrganizationSummary[]
    search: string
    page: number
    pageSize: number
    total: number
    totalPages: number
}

export interface AdminUserListResult {
    items: AdminUserSummary[]
    search: string
    page: number
    pageSize: number
    total: number
    totalPages: number
}

export interface AdminDashboardSummary {
    organizationCount: number
    userCount: number
    skillCount: number
    knowledgeDocumentCount: number
    messageCount: number
    totalTokenCount: number
    totalCreditUsage: number
}

export interface AdminUsageMetricsSummary {
    periodKey: string
    isAllTime: boolean
    messageCount: number
    totalTokenCount: number
    totalCreditUsage: number
}

export interface AdminBillingPlanMetricsSummary {
    monthlySubscriptionAmountTry: number
    monthlySubscriptionCount: number
    monthlyTopupAmountTry: number
    monthlyTopupCreditsPurchased: number
    monthlyTopupCreditsUsed: number
}

function buildOrganizationMembershipLookup(organizations: OrganizationRow[]) {
    return new Map<string, OrganizationRow>(
        organizations.map((organization) => [organization.id, organization])
    )
}

function buildAdminUserOrganizations(
    memberships: MembershipRow[],
    organizationLookup: Map<string, OrganizationRow>
): AdminUserOrganizationMembership[] {
    return memberships
        .map((membership) => {
            const organization = organizationLookup.get(membership.organization_id)
            if (!organization) return null

            return {
                organizationId: organization.id,
                organizationName: organization.name,
                organizationSlug: organization.slug,
                role: membership.role
            } satisfies AdminUserOrganizationMembership
        })
        .filter((membership): membership is AdminUserOrganizationMembership => membership !== null)
        .sort((a, b) => a.organizationName.localeCompare(b.organizationName, undefined, { sensitivity: 'base' }))
}

function buildMembershipsByUser(memberships: MembershipRow[]) {
    const membershipsByUser = new Map<string, MembershipRow[]>()

    for (const membership of memberships) {
        const existing = membershipsByUser.get(membership.user_id)
        if (existing) {
            existing.push(membership)
            continue
        }
        membershipsByUser.set(membership.user_id, [membership])
    }

    return membershipsByUser
}

interface OrganizationRow {
    id: string
    name: string
    slug: string
    created_at: string
}

interface ProfileRow {
    id: string
    full_name: string | null
    email: string | null
    is_system_admin: boolean | null
    created_at: string
}

interface MembershipRow {
    organization_id: string
    user_id: string
    role: string
    created_at: string
}

interface TokenUsageRow {
    organization_id: string
    total_tokens: number | null
}

const EMPTY_BILLING_SNAPSHOT: AdminBillingSnapshot = {
    membershipState: null,
    lockReason: null,
    isUsageAllowed: false,
    isTopupAllowed: false,
    trialEndsAt: null,
    currentPeriodEnd: null,
    trialCreditsUsed: 0,
    trialCreditsLimit: 0,
    trialCreditsRemaining: 0,
    packageCreditsUsed: 0,
    packageCreditsLimit: 0,
    packageCreditsRemaining: 0,
    topupCreditsRemaining: 0
}

const EMPTY_COUNT_MAP = new Map<string, number>()

function toNonNegativeInteger(value: unknown): number {
    const normalized = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value)
    if (!Number.isFinite(normalized)) return 0
    return Math.max(0, Math.floor(normalized))
}

function toNonNegativeNumber(value: unknown): number {
    const normalized = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
    if (!Number.isFinite(normalized)) return 0
    return Math.max(0, normalized)
}

function chunkValues<T>(values: T[], chunkSize: number): T[][] {
    if (values.length === 0) return []

    const chunks: T[][] = []
    for (let index = 0; index < values.length; index += chunkSize) {
        chunks.push(values.slice(index, index + chunkSize))
    }
    return chunks
}

async function getCountByOrganization(
    supabase: SupabaseClient,
    organizationIds: string[],
    tableName: 'organization_members' | 'skills' | 'knowledge_documents' | 'messages'
): Promise<Map<string, number>> {
    if (organizationIds.length === 0) return EMPTY_COUNT_MAP

    const counts = new Map<string, number>()

    for (const organizationIdBatch of chunkValues(organizationIds, 100)) {
        const { data, error } = await supabase
            .from(tableName)
            .select('organization_id')
            .in('organization_id', organizationIdBatch)

        if (error) {
            console.error(`Failed to count ${tableName} for organization batch:`, error)
            continue
        }

        const rows = (data ?? []) as Array<{ organization_id: string }>
        for (const row of rows) {
            const current = counts.get(row.organization_id) ?? 0
            counts.set(row.organization_id, current + 1)
        }
    }

    return counts
}

async function getTokenTotalsByOrganization(
    supabase: SupabaseClient,
    organizationIds: string[]
): Promise<Map<string, number>> {
    if (organizationIds.length === 0) return EMPTY_COUNT_MAP

    const totals = new Map<string, number>()

    for (const organizationIdBatch of chunkValues(organizationIds, 100)) {
        const { data, error } = await supabase
            .from('organization_ai_usage')
            .select('organization_id, total_tokens')
            .in('organization_id', organizationIdBatch)

        if (error) {
            console.error('Failed to load token usage for organization batch:', error)
            continue
        }

        const rows = (data ?? []) as TokenUsageRow[]
        for (const row of rows) {
            const current = totals.get(row.organization_id) ?? 0
            totals.set(row.organization_id, current + (row.total_tokens ?? 0))
        }
    }

    return totals
}

function mapBillingRowToAdminSnapshot(row: OrganizationBillingAccount): AdminBillingSnapshot {
    const snapshot = buildOrganizationBillingSnapshot(row)

    return {
        membershipState: snapshot.membershipState,
        lockReason: snapshot.lockReason,
        isUsageAllowed: snapshot.isUsageAllowed,
        isTopupAllowed: snapshot.isTopupAllowed,
        trialEndsAt: snapshot.trial.endsAt,
        currentPeriodEnd: snapshot.package.periodEnd,
        trialCreditsUsed: snapshot.trial.credits.used,
        trialCreditsLimit: snapshot.trial.credits.limit,
        trialCreditsRemaining: snapshot.trial.credits.remaining,
        packageCreditsUsed: snapshot.package.credits.used,
        packageCreditsLimit: snapshot.package.credits.limit,
        packageCreditsRemaining: snapshot.package.credits.remaining,
        topupCreditsRemaining: snapshot.topupBalance
    }
}

async function getBillingByOrganization(
    supabase: SupabaseClient,
    organizationIds: string[]
): Promise<Map<string, AdminBillingSnapshot>> {
    if (organizationIds.length === 0) return new Map()

    const billingByOrganization = new Map<string, AdminBillingSnapshot>()

    for (const organizationIdBatch of chunkValues(organizationIds, 100)) {
        const { data, error } = await supabase
            .from('organization_billing_accounts')
            .select('*')
            .in('organization_id', organizationIdBatch)

        if (error) {
            console.error('Failed to load billing accounts for organization batch:', error)
            continue
        }

        const rows = (data ?? []) as OrganizationBillingAccount[]
        for (const row of rows) {
            billingByOrganization.set(row.organization_id, mapBillingRowToAdminSnapshot(row))
        }
    }

    return billingByOrganization
}

async function getOrganizations(supabase: SupabaseClient): Promise<OrganizationRow[]> {
    const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, created_at')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Failed to load organizations for admin read model:', error)
        return []
    }

    return (data ?? []) as OrganizationRow[]
}

async function getProfiles(supabase: SupabaseClient): Promise<ProfileRow[]> {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, is_system_admin, created_at')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Failed to load profiles for admin read model:', error)
        return []
    }

    return (data ?? []) as ProfileRow[]
}

async function getTableCount(
    supabase: SupabaseClient,
    tableName: 'organizations' | 'profiles' | 'skills' | 'knowledge_documents' | 'messages'
): Promise<number> {
    const { count, error } = await supabase
        .from(tableName)
        .select('id', { count: 'exact', head: true })

    if (error) {
        console.error(`Failed to count ${tableName} for admin read model:`, error)
        return 0
    }

    return count ?? 0
}

interface AdminUsageDateRange {
    monthStartIso: string
    nextMonthStartIso: string
}

async function getMessageCountForRange(
    supabase: SupabaseClient,
    options: {
        organizationId?: string
        dateRange?: AdminUsageDateRange | null
    }
): Promise<number> {
    let query = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })

    if (options.organizationId) {
        query = query.eq('organization_id', options.organizationId)
    }

    if (options.dateRange) {
        query = query
            .gte('created_at', options.dateRange.monthStartIso)
            .lt('created_at', options.dateRange.nextMonthStartIso)
    }

    const { count, error } = await query
    if (error) {
        console.error('Failed to load message totals for admin dashboard usage metrics:', error)
        return 0
    }

    return toNonNegativeInteger(count)
}

async function getUsageTotalsForRange(
    supabase: SupabaseClient,
    options: {
        organizationId?: string
        dateRange?: AdminUsageDateRange | null
    }
) {
    const pageSize = 1000
    let offset = 0
    let totalTokenCount = 0
    let totalCreditUsageTenths = 0

    while (true) {
        let query = supabase
            .from('organization_ai_usage')
            .select('total_tokens, input_tokens, output_tokens')
            .order('created_at', { ascending: true })
            .range(offset, offset + pageSize - 1)

        if (options.organizationId) {
            query = query.eq('organization_id', options.organizationId)
        }

        if (options.dateRange) {
            query = query
                .gte('created_at', options.dateRange.monthStartIso)
                .lt('created_at', options.dateRange.nextMonthStartIso)
        }

        const { data, error } = await query
        if (error) {
            console.error('Failed to load AI usage totals for admin dashboard usage metrics:', error)
            return {
                totalTokenCount,
                totalCreditUsage: totalCreditUsageTenths / 10
            }
        }

        const rows = (data ?? []) as Array<{
            total_tokens: number | null
            input_tokens: number | null
            output_tokens: number | null
        }>

        const chunkSummary = summarizeUsageMetricRows(rows.map((row) => ({
            totalTokens: toNonNegativeNumber(row.total_tokens),
            inputTokens: toNonNegativeNumber(row.input_tokens),
            outputTokens: toNonNegativeNumber(row.output_tokens)
        })))
        totalTokenCount += chunkSummary.totalTokenCount
        totalCreditUsageTenths += Math.round(chunkSummary.totalCreditUsage * 10)

        if (rows.length < pageSize) break
        offset += pageSize
    }

    return {
        totalTokenCount: Math.floor(totalTokenCount),
        totalCreditUsage: totalCreditUsageTenths / 10
    }
}

async function getGlobalTokenTotalFallback(supabase: SupabaseClient): Promise<number> {
    const usageTotals = await getUsageTotalsForRange(supabase, {})
    return usageTotals.totalTokenCount
}

async function getCreditUsageTotalFallback(
    supabase: SupabaseClient,
    organizationId?: string
): Promise<number> {
    const usageTotals = await getUsageTotalsForRange(supabase, {
        organizationId
    })

    return usageTotals.totalCreditUsage
}

async function getGlobalCreditUsageFallback(supabase: SupabaseClient): Promise<number> {
    return getCreditUsageTotalFallback(supabase)
}

export async function getAdminUsageMetricsSummary(
    options: {
        organizationId: string | null
        periodKey?: string | null
    },
    supabaseOverride?: SupabaseClient
): Promise<AdminUsageMetricsSummary> {
    const supabase = supabaseOverride ?? await createClient()
    const periodKey = resolveAdminMetricPeriodKey(options.periodKey)
    const dateRange = resolveAdminMetricPeriodRange(periodKey)
    const organizationId = options.organizationId ?? undefined

    const [messageCount, usageTotals] = await Promise.all([
        getMessageCountForRange(supabase, {
            organizationId,
            dateRange
        }),
        getUsageTotalsForRange(supabase, {
            organizationId,
            dateRange
        })
    ])

    return {
        periodKey,
        isAllTime: periodKey === ADMIN_METRIC_PERIOD_ALL,
        messageCount,
        totalTokenCount: usageTotals.totalTokenCount,
        totalCreditUsage: usageTotals.totalCreditUsage
    }
}

export async function getAdminCreditUsageTotal(
    organizationId: string | null,
    supabaseOverride?: SupabaseClient,
    periodKey?: string | null
): Promise<number> {
    const summary = await getAdminUsageMetricsSummary(
        {
            organizationId,
            periodKey
        },
        supabaseOverride
    )
    return summary.totalCreditUsage
}

function getCurrentUtcMonthRange() {
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

    return {
        monthStartIso: monthStart.toISOString(),
        nextMonthStartIso: nextMonthStart.toISOString()
    }
}

export async function getAdminBillingPlanMetricsSummary(
    organizationId: string | null,
    supabaseOverride?: SupabaseClient
): Promise<AdminBillingPlanMetricsSummary> {
    const supabase = supabaseOverride ?? await createClient()
    const { monthStartIso, nextMonthStartIso } = getCurrentUtcMonthRange()

    let subscriptionsQuery = supabase
        .from('organization_subscription_records')
        .select('metadata')
        .eq('status', 'active')
        .gte('created_at', monthStartIso)
        .lt('created_at', nextMonthStartIso)

    let topupPurchasesQuery = supabase
        .from('credit_purchase_orders')
        .select('credits, amount_try')
        .eq('status', 'paid')
        .gte('paid_at', monthStartIso)
        .lt('paid_at', nextMonthStartIso)

    let topupUsageQuery = supabase
        .from('organization_credit_ledger')
        .select('metadata, credit_pool, credits_delta')
        .eq('entry_type', 'usage_debit')
        .gte('created_at', monthStartIso)
        .lt('created_at', nextMonthStartIso)

    if (organizationId) {
        subscriptionsQuery = subscriptionsQuery.eq('organization_id', organizationId)
        topupPurchasesQuery = topupPurchasesQuery.eq('organization_id', organizationId)
        topupUsageQuery = topupUsageQuery.eq('organization_id', organizationId)
    }

    const [subscriptionsResult, topupPurchasesResult, topupUsageResult] = await Promise.all([
        subscriptionsQuery,
        topupPurchasesQuery,
        topupUsageQuery
    ])

    if (subscriptionsResult.error) {
        console.error('Failed to load monthly subscription metrics for admin dashboard:', subscriptionsResult.error)
    }

    if (topupPurchasesResult.error) {
        console.error('Failed to load monthly top-up purchase metrics for admin dashboard:', topupPurchasesResult.error)
    }

    if (topupUsageResult.error) {
        console.error('Failed to load monthly top-up usage metrics for admin dashboard:', topupUsageResult.error)
    }

    const subscriptionRows = (subscriptionsResult.data ?? []) as Array<{ metadata: Json }>
    const topupPurchaseRows = (topupPurchasesResult.data ?? []) as Array<{
        credits: number | null
        amount_try: number | null
    }>
    const topupUsageRows = (topupUsageResult.data ?? []) as Array<{
        metadata: Json
        credit_pool: string | null
        credits_delta: number | null
    }>

    const monthlySubscriptionAmountTry = subscriptionRows.reduce((sum, row) => (
        sum + resolveMonthlySubscriptionAmountTry(row.metadata)
    ), 0)

    const monthlyTopupAmountTry = topupPurchaseRows.reduce((sum, row) => (
        sum + Number(row.amount_try ?? 0)
    ), 0)

    const monthlyTopupCreditsPurchased = topupPurchaseRows.reduce((sum, row) => (
        sum + Number(row.credits ?? 0)
    ), 0)

    const monthlyTopupCreditsUsed = topupUsageRows.reduce((sum, row) => (
        sum + resolveTopupUsageDebit({
            metadata: row.metadata,
            creditPool: row.credit_pool,
            creditsDelta: row.credits_delta
        })
    ), 0)

    return {
        monthlySubscriptionAmountTry,
        monthlySubscriptionCount: subscriptionRows.length,
        monthlyTopupAmountTry,
        monthlyTopupCreditsPurchased,
        monthlyTopupCreditsUsed
    }
}

async function getOrganizationsByIds(
    supabase: SupabaseClient,
    organizationIds: string[]
): Promise<OrganizationRow[]> {
    if (organizationIds.length === 0) return []

    const rows: OrganizationRow[] = []
    for (const organizationIdBatch of chunkValues(organizationIds, 100)) {
        const { data, error } = await supabase
            .from('organizations')
            .select('id, name, slug, created_at')
            .in('id', organizationIdBatch)

        if (error) {
            console.error('Failed to load organizations by ids for admin read model:', error)
            continue
        }

        rows.push(...((data ?? []) as OrganizationRow[]))
    }

    return rows
}

async function getProfilesByIds(
    supabase: SupabaseClient,
    userIds: string[]
): Promise<ProfileRow[]> {
    if (userIds.length === 0) return []

    const rows: ProfileRow[] = []
    for (const userIdBatch of chunkValues(userIds, 100)) {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, is_system_admin, created_at')
            .in('id', userIdBatch)

        if (error) {
            console.error('Failed to load profiles by ids for admin read model:', error)
            continue
        }

        rows.push(...((data ?? []) as ProfileRow[]))
    }

    return rows
}

async function getMembershipsByUserIds(
    supabase: SupabaseClient,
    userIds: string[]
): Promise<MembershipRow[]> {
    if (userIds.length === 0) return []

    const rows: MembershipRow[] = []
    for (const userIdBatch of chunkValues(userIds, 100)) {
        const { data, error } = await supabase
            .from('organization_members')
            .select('organization_id, user_id, role, created_at')
            .in('user_id', userIdBatch)

        if (error) {
            console.error('Failed to load memberships by user ids for admin read model:', error)
            continue
        }

        rows.push(...((data ?? []) as MembershipRow[]))
    }

    return rows
}

async function getMembershipsByOrganizationId(
    supabase: SupabaseClient,
    organizationId: string
): Promise<MembershipRow[]> {
    const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id, user_id, role, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true })

    if (error) {
        console.error('Failed to load memberships by organization id for admin read model:', error)
        return []
    }

    return (data ?? []) as MembershipRow[]
}

async function getBillingAdminAuditEntriesByOrganizationId(
    supabase: SupabaseClient,
    organizationId: string,
    limit = 25
): Promise<AdminBillingAuditEntry[]> {
    const { data, error } = await supabase
        .from('billing_admin_audit_log')
        .select('id, action_type, actor_id, reason, before_state, after_state, metadata, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('Failed to load billing admin audit rows for organization detail:', error)
        return []
    }

    const rows = (data ?? []) as BillingAdminAuditLog[]
    if (rows.length === 0) return []

    const actorIds = Array.from(new Set(rows.map((row) => row.actor_id)))
    const actorProfiles = await getProfilesByIds(supabase, actorIds)
    const actorById = new Map(actorProfiles.map((profile) => [profile.id, profile]))

    return rows.map((row) => {
        const actor = actorById.get(row.actor_id)
        return {
            id: row.id,
            actionType: row.action_type,
            actorId: row.actor_id,
            actorName: actor?.full_name ?? null,
            actorEmail: actor?.email ?? null,
            reason: row.reason,
            beforeState: row.before_state,
            afterState: row.after_state,
            metadata: row.metadata,
            createdAt: row.created_at
        } satisfies AdminBillingAuditEntry
    })
}

function buildLikeSearchInput(value: string) {
    return value.replace(/[%_]/g, '').replace(/,/g, ' ').trim()
}

function getCount(counts: Map<string, number>, organizationId: string) {
    return counts.get(organizationId) ?? 0
}

function isExpectedAdminTotalsRpcFallback(error: unknown) {
    if (!error || typeof error !== 'object') return false

    const candidate = error as { code?: string | null; message?: string | null }
    if (candidate.code === 'PGRST202' || candidate.code === '42883') {
        return true
    }

    return typeof candidate.message === 'string'
        && candidate.message.toLowerCase().includes('get_admin_dashboard_totals')
}

async function buildOrganizationSummariesFromRows(
    supabase: SupabaseClient,
    organizations: OrganizationRow[]
): Promise<AdminOrganizationSummary[]> {
    if (organizations.length === 0) return []

    const organizationIds = organizations.map((organization) => organization.id)

    const [memberCounts, skillCounts, knowledgeCounts, messageCounts, tokenTotals, billingByOrganization] = await Promise.all([
        getCountByOrganization(supabase, organizationIds, 'organization_members'),
        getCountByOrganization(supabase, organizationIds, 'skills'),
        getCountByOrganization(supabase, organizationIds, 'knowledge_documents'),
        getCountByOrganization(supabase, organizationIds, 'messages'),
        getTokenTotalsByOrganization(supabase, organizationIds),
        getBillingByOrganization(supabase, organizationIds)
    ])

    return organizations.map((organization) => {
        const memberCount = getCount(memberCounts, organization.id)

        return {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            createdAt: organization.created_at,
            memberCount,
            profileCount: memberCount,
            skillCount: getCount(skillCounts, organization.id),
            knowledgeDocumentCount: getCount(knowledgeCounts, organization.id),
            totalMessageCount: getCount(messageCounts, organization.id),
            totalTokenCount: getCount(tokenTotals, organization.id),
            billing: billingByOrganization.get(organization.id) ?? EMPTY_BILLING_SNAPSHOT
        }
    })
}

async function getOrganizationPageRows(
    supabase: SupabaseClient,
    options: {
        search: string
        page: number
        pageSize: number
    }
): Promise<{
    rows: OrganizationRow[]
    total: number
    page: number
    totalPages: number
}> {
    const normalizedSearch = buildLikeSearchInput(options.search)

    let countQuery = supabase
        .from('organizations')
        .select('id', { count: 'exact', head: true })

    if (normalizedSearch) {
        countQuery = countQuery.or(`name.ilike.%${normalizedSearch}%,slug.ilike.%${normalizedSearch}%`)
    }

    const { count, error: countError } = await countQuery

    if (countError) {
        console.error('Failed to count organizations for admin list:', countError)
        return {
            rows: [],
            total: 0,
            page: 1,
            totalPages: 1
        }
    }

    const total = count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / options.pageSize))
    const page = clampPage(options.page, totalPages)
    const from = (page - 1) * options.pageSize
    const to = from + options.pageSize - 1

    let rowsQuery = supabase
        .from('organizations')
        .select('id, name, slug, created_at')
        .order('created_at', { ascending: false })
        .range(from, to)

    if (normalizedSearch) {
        rowsQuery = rowsQuery.or(`name.ilike.%${normalizedSearch}%,slug.ilike.%${normalizedSearch}%`)
    }

    const { data, error } = await rowsQuery
    if (error) {
        console.error('Failed to load organizations page rows for admin list:', error)
        return {
            rows: [],
            total,
            page,
            totalPages
        }
    }

    return {
        rows: (data ?? []) as OrganizationRow[],
        total,
        page,
        totalPages
    }
}

async function getProfilePageRows(
    supabase: SupabaseClient,
    options: {
        search: string
        page: number
        pageSize: number
    }
): Promise<{
    rows: ProfileRow[]
    total: number
    page: number
    totalPages: number
}> {
    const normalizedSearch = buildLikeSearchInput(options.search)

    let countQuery = supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })

    if (normalizedSearch) {
        countQuery = countQuery.or(`full_name.ilike.%${normalizedSearch}%,email.ilike.%${normalizedSearch}%`)
    }

    const { count, error: countError } = await countQuery

    if (countError) {
        console.error('Failed to count profiles for admin user list:', countError)
        return {
            rows: [],
            total: 0,
            page: 1,
            totalPages: 1
        }
    }

    const total = count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / options.pageSize))
    const page = clampPage(options.page, totalPages)
    const from = (page - 1) * options.pageSize
    const to = from + options.pageSize - 1

    let rowsQuery = supabase
        .from('profiles')
        .select('id, full_name, email, is_system_admin, created_at')
        .order('created_at', { ascending: false })
        .range(from, to)

    if (normalizedSearch) {
        rowsQuery = rowsQuery.or(`full_name.ilike.%${normalizedSearch}%,email.ilike.%${normalizedSearch}%`)
    }

    const { data, error } = await rowsQuery
    if (error) {
        console.error('Failed to load profile page rows for admin user list:', error)
        return {
            rows: [],
            total,
            page,
            totalPages
        }
    }

    return {
        rows: (data ?? []) as ProfileRow[],
        total,
        page,
        totalPages
    }
}

async function buildUserSummariesFromProfiles(
    supabase: SupabaseClient,
    profiles: ProfileRow[]
): Promise<AdminUserSummary[]> {
    if (profiles.length === 0) return []

    const userIds = profiles.map((profile) => profile.id)
    const memberships = await getMembershipsByUserIds(supabase, userIds)
    const membershipsByUser = buildMembershipsByUser(memberships)

    const organizationIds = Array.from(
        new Set(memberships.map((membership) => membership.organization_id))
    )
    const organizations = await getOrganizationsByIds(supabase, organizationIds)
    const organizationLookup = buildOrganizationMembershipLookup(organizations)

    return profiles.map((profile) => {
        const profileMemberships = membershipsByUser.get(profile.id) ?? []
        const userOrganizations = buildAdminUserOrganizations(profileMemberships, organizationLookup)

        return {
            id: profile.id,
            fullName: profile.full_name,
            email: profile.email,
            createdAt: profile.created_at,
            isSystemAdmin: Boolean(profile.is_system_admin),
            organizationCount: userOrganizations.length,
            organizations: userOrganizations
        }
    })
}

async function getAdminDashboardSummaryFallback(
    supabase: SupabaseClient
): Promise<AdminDashboardSummary> {
    const [
        organizationCount,
        userCount,
        skillCount,
        knowledgeDocumentCount,
        messageCount,
        totalTokenCount,
        totalCreditUsage
    ] = await Promise.all([
        getTableCount(supabase, 'organizations'),
        getTableCount(supabase, 'profiles'),
        getTableCount(supabase, 'skills'),
        getTableCount(supabase, 'knowledge_documents'),
        getTableCount(supabase, 'messages'),
        getGlobalTokenTotalFallback(supabase),
        getGlobalCreditUsageFallback(supabase)
    ])

    return {
        organizationCount,
        userCount,
        skillCount,
        knowledgeDocumentCount,
        messageCount,
        totalTokenCount,
        totalCreditUsage
    }
}

export async function getAdminDashboardSummary(
    supabaseOverride?: SupabaseClient
): Promise<AdminDashboardSummary> {
    const supabase = supabaseOverride ?? await createClient()

    const [{ data, error }, totalCreditUsage] = await Promise.all([
        supabase
            .rpc('get_admin_dashboard_totals')
            .maybeSingle(),
        getGlobalCreditUsageFallback(supabase)
    ])

    if (error || !data) {
        if (error) {
            if (isExpectedAdminTotalsRpcFallback(error)) {
                console.info('Admin dashboard totals RPC unavailable, using fallback aggregate queries.')
            } else {
                console.warn('Admin dashboard totals RPC failed, using fallback aggregate queries:', error)
            }
        }
        return getAdminDashboardSummaryFallback(supabase)
    }

    const row = data as {
        organization_count?: unknown
        user_count?: unknown
        skill_count?: unknown
        knowledge_document_count?: unknown
        message_count?: unknown
        total_token_count?: unknown
    }

    return {
        organizationCount: toNonNegativeInteger(row.organization_count),
        userCount: toNonNegativeInteger(row.user_count),
        skillCount: toNonNegativeInteger(row.skill_count),
        knowledgeDocumentCount: toNonNegativeInteger(row.knowledge_document_count),
        messageCount: toNonNegativeInteger(row.message_count),
        totalTokenCount: toNonNegativeInteger(row.total_token_count),
        totalCreditUsage
    }
}

export async function getAdminOrganizationSummaries(
    supabaseOverride?: SupabaseClient
): Promise<AdminOrganizationSummary[]> {
    const supabase = supabaseOverride ?? await createClient()
    const organizations = await getOrganizations(supabase)
    return buildOrganizationSummariesFromRows(supabase, organizations)
}

function clampPage(value: number | undefined, totalPages: number) {
    if (!Number.isFinite(value ?? Number.NaN)) return 1
    const page = Math.floor(value ?? 1)
    if (page < 1) return 1
    if (page > totalPages) return totalPages
    return page
}

export async function getAdminOrganizationListResult(
    options?: {
        search?: string
        page?: number
        pageSize?: number
    },
    supabaseOverride?: SupabaseClient
): Promise<AdminOrganizationListResult> {
    const supabase = supabaseOverride ?? await createClient()
    const search = options?.search?.trim() ?? ''
    const pageSize = options?.pageSize && options.pageSize > 0 ? Math.floor(options.pageSize) : 10

    const pageResult = await getOrganizationPageRows(supabase, {
        search,
        page: options?.page ?? 1,
        pageSize
    })
    const items = await buildOrganizationSummariesFromRows(supabase, pageResult.rows)

    return {
        items,
        search,
        page: pageResult.page,
        pageSize,
        total: pageResult.total,
        totalPages: pageResult.totalPages
    }
}

export async function getAdminUserSummaries(
    supabaseOverride?: SupabaseClient
): Promise<AdminUserSummary[]> {
    const supabase = supabaseOverride ?? await createClient()
    const profiles = await getProfiles(supabase)
    return buildUserSummariesFromProfiles(supabase, profiles)
}

export async function getAdminUserCount(
    supabaseOverride?: SupabaseClient
): Promise<number> {
    const supabase = supabaseOverride ?? await createClient()
    const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })

    if (error) {
        console.error('Failed to count profiles for admin read model:', error)
        return 0
    }

    return count ?? 0
}

export async function getAdminUserListResult(
    options?: {
        search?: string
        page?: number
        pageSize?: number
    },
    supabaseOverride?: SupabaseClient
): Promise<AdminUserListResult> {
    const supabase = supabaseOverride ?? await createClient()
    const search = options?.search?.trim() ?? ''
    const pageSize = options?.pageSize && options.pageSize > 0 ? Math.floor(options.pageSize) : 10

    const pageResult = await getProfilePageRows(supabase, {
        search,
        page: options?.page ?? 1,
        pageSize
    })
    const items = await buildUserSummariesFromProfiles(supabase, pageResult.rows)

    return {
        items,
        search,
        page: pageResult.page,
        pageSize,
        total: pageResult.total,
        totalPages: pageResult.totalPages
    }
}

export async function getAdminUserDetail(
    userId: string,
    supabaseOverride?: SupabaseClient
): Promise<AdminUserDetail | null> {
    const supabase = supabaseOverride ?? await createClient()
    const [profiles, memberships] = await Promise.all([
        getProfilesByIds(supabase, [userId]),
        getMembershipsByUserIds(supabase, [userId])
    ])
    const profile = profiles[0]
    if (!profile) return null

    memberships.sort((a, b) => a.created_at.localeCompare(b.created_at))

    const organizationIds = Array.from(new Set(memberships.map((membership) => membership.organization_id)))
    const organizations = await getOrganizationsByIds(supabase, organizationIds)
    const organizationLookup = buildOrganizationMembershipLookup(organizations)
    const userOrganizations = buildAdminUserOrganizations(memberships, organizationLookup)

    const user: AdminUserSummary = {
        id: profile.id,
        fullName: profile.full_name,
        email: profile.email,
        createdAt: profile.created_at,
        isSystemAdmin: Boolean(profile.is_system_admin),
        organizationCount: userOrganizations.length,
        organizations: userOrganizations
    }

    const organizationSummaryList = await buildOrganizationSummariesFromRows(supabase, organizations)
    const organizationSummaryById = new Map<string, AdminOrganizationSummary>(
        organizationSummaryList.map((organization) => [organization.id, organization])
    )

    const organizationSnapshots = memberships
        .map((membership) => {
            const organization = organizationSummaryById.get(membership.organization_id)
            if (!organization) return null
            return {
                ...organization,
                role: membership.role
            }
        })
        .filter((snapshot): snapshot is AdminOrganizationSummary & { role: string } => snapshot !== null)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    return {
        user,
        organizationSnapshots
    }
}

export async function getAdminOrganizationDetail(
    organizationId: string,
    supabaseOverride?: SupabaseClient
): Promise<AdminOrganizationDetail | null> {
    const supabase = supabaseOverride ?? await createClient()
    const organizations = await getOrganizationsByIds(supabase, [organizationId])
    if (organizations.length === 0) return null

    const [organizationSummaryList, organizationMemberships, billingAuditEntries] = await Promise.all([
        buildOrganizationSummariesFromRows(supabase, organizations),
        getMembershipsByOrganizationId(supabase, organizationId),
        getBillingAdminAuditEntriesByOrganizationId(supabase, organizationId)
    ])

    const organization = organizationSummaryList[0]
    if (!organization) return null

    const memberIds = Array.from(new Set(organizationMemberships.map((membership) => membership.user_id)))
    const [profiles, allMembershipsForMembers] = await Promise.all([
        getProfilesByIds(supabase, memberIds),
        getMembershipsByUserIds(supabase, memberIds)
    ])

    const relatedOrganizationIds = Array.from(
        new Set(allMembershipsForMembers.map((membership) => membership.organization_id))
    )
    const relatedOrganizations = await getOrganizationsByIds(supabase, relatedOrganizationIds)

    const profileById = new Map<string, ProfileRow>(profiles.map((profile) => [profile.id, profile]))
    const relatedOrganizationById = new Map<string, OrganizationRow>(
        relatedOrganizations.map((summary) => [summary.id, summary])
    )
    const membershipsByUser = new Map<string, MembershipRow[]>()
    for (const membership of allMembershipsForMembers) {
        const existing = membershipsByUser.get(membership.user_id)
        if (existing) {
            existing.push(membership)
            continue
        }
        membershipsByUser.set(membership.user_id, [membership])
    }

    const profilesSnapshot = organizationMemberships.map((membership) => {
        const profile = profileById.get(membership.user_id)
        const allMemberships = membershipsByUser.get(membership.user_id) ?? []

        const organizations = allMemberships
            .map((entry) => {
                const relatedOrganization = relatedOrganizationById.get(entry.organization_id)
                if (!relatedOrganization) return null

                return {
                    organizationId: relatedOrganization.id,
                    organizationName: relatedOrganization.name,
                    organizationSlug: relatedOrganization.slug,
                    role: entry.role
                } satisfies AdminUserOrganizationMembership
            })
            .filter((entry): entry is AdminUserOrganizationMembership => entry !== null)
            .sort((a, b) => a.organizationName.localeCompare(b.organizationName, undefined, { sensitivity: 'base' }))

        return {
            userId: membership.user_id,
            fullName: profile?.full_name ?? null,
            email: profile?.email ?? null,
            isSystemAdmin: Boolean(profile?.is_system_admin),
            role: membership.role,
            joinedAt: membership.created_at,
            organizationCount: organizations.length,
            organizations
        } satisfies AdminOrganizationProfileSnapshot
    })

    profilesSnapshot.sort((a, b) => {
        const aLabel = (a.fullName ?? a.email ?? '').toLocaleLowerCase()
        const bLabel = (b.fullName ?? b.email ?? '').toLocaleLowerCase()
        return aLabel.localeCompare(bLabel)
    })

    return {
        organization,
        profiles: profilesSnapshot,
        billingAuditEntries
    }
}
