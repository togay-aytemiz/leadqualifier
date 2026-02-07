import { createClient } from '@/lib/supabase/server'

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
    premiumStatus: 'not_integrated'
    trialStatus: 'not_integrated'
    planStatus: 'not_integrated'
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

const EMPTY_COUNT_MAP = new Map<string, number>()

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

function buildLikeSearchInput(value: string) {
    return value.replace(/[%_]/g, '').replace(/,/g, ' ').trim()
}

function getCount(counts: Map<string, number>, organizationId: string) {
    return counts.get(organizationId) ?? 0
}

async function buildOrganizationSummariesFromRows(
    supabase: SupabaseClient,
    organizations: OrganizationRow[]
): Promise<AdminOrganizationSummary[]> {
    if (organizations.length === 0) return []

    const organizationIds = organizations.map((organization) => organization.id)

    const [memberCounts, skillCounts, knowledgeCounts, messageCounts, tokenTotals] = await Promise.all([
        getCountByOrganization(supabase, organizationIds, 'organization_members'),
        getCountByOrganization(supabase, organizationIds, 'skills'),
        getCountByOrganization(supabase, organizationIds, 'knowledge_documents'),
        getCountByOrganization(supabase, organizationIds, 'messages'),
        getTokenTotalsByOrganization(supabase, organizationIds)
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
            premiumStatus: 'not_integrated',
            trialStatus: 'not_integrated',
            planStatus: 'not_integrated'
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

    const [organizationSummaryList, organizationMemberships] = await Promise.all([
        buildOrganizationSummariesFromRows(supabase, organizations),
        getMembershipsByOrganizationId(supabase, organizationId)
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
        profiles: profilesSnapshot
    }
}
