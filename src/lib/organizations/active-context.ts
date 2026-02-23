import { cookies } from 'next/headers'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const ACTIVE_ORG_COOKIE = 'active_org_id'

export interface ActiveOrganizationSummary {
    id: string
    name: string
    slug: string
}

export interface ActiveOrganizationContext {
    userId: string
    isSystemAdmin: boolean
    userFullName?: string | null
    userEmail?: string | null
    accessibleOrganizations: ActiveOrganizationSummary[]
    activeOrganizationId: string | null
    activeOrganization: ActiveOrganizationSummary | null
    source: 'cookie' | 'fallback' | 'none'
    readOnlyTenantMode: boolean
}

interface UserContext {
    userId: string
    isSystemAdmin: boolean
    userFullName: string | null
    userEmail: string | null
}

export interface ResolveActiveOrganizationContextOptions {
    includeAccessibleOrganizations?: boolean
}

interface MembershipWithOrganization {
    organization_id: string
    organizations:
        | {
            id: string
            name: string
            slug: string
        }
        | Array<{
            id: string
            name: string
            slug: string
        }>
        | null
}

const EXCLUDED_SYSTEM_ADMIN_ORGANIZATION_NAMES = new Set(['ai qa lab'])
const EXCLUDED_SYSTEM_ADMIN_ORGANIZATION_SLUGS = new Set(['ai-qa-lab'])

function isActiveOrganizationSummary(value: unknown): value is ActiveOrganizationSummary {
    if (typeof value !== 'object' || value === null) return false

    const candidate = value as Record<string, unknown>
    return (
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.slug === 'string'
    )
}

function isExcludedForSystemAdminOrganizationList(organization: ActiveOrganizationSummary) {
    const normalizedName = organization.name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
    const normalizedSlug = organization.slug
        .trim()
        .toLowerCase()
        .replace(/_/g, '-')

    return (
        EXCLUDED_SYSTEM_ADMIN_ORGANIZATION_NAMES.has(normalizedName) ||
        EXCLUDED_SYSTEM_ADMIN_ORGANIZATION_SLUGS.has(normalizedSlug) ||
        normalizedName.includes('qa lab') ||
        normalizedSlug.includes('qa-lab')
    )
}

function filterExcludedSystemAdminOrganizations(
    organizations: ActiveOrganizationSummary[]
): ActiveOrganizationSummary[] {
    return organizations.filter((organization) => !isExcludedForSystemAdminOrganizationList(organization))
}

async function getCurrentUserContext(supabaseOverride?: Awaited<ReturnType<typeof createClient>>): Promise<UserContext | null> {
    const supabase = supabaseOverride ?? await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_system_admin, full_name, email')
        .eq('id', user.id)
        .single()

    return {
        userId: user.id,
        isSystemAdmin: Boolean(profile?.is_system_admin),
        userFullName: typeof profile?.full_name === 'string' ? profile.full_name : null,
        userEmail: typeof profile?.email === 'string'
            ? profile.email
            : (typeof user.email === 'string' ? user.email : null)
    }
}

function buildOrganizationsFromMemberships(memberships: MembershipWithOrganization[] | null | undefined) {
    const seen = new Set<string>()
    const organizations: ActiveOrganizationSummary[] = []

    for (const membership of memberships ?? []) {
        const organizationCandidate = Array.isArray(membership.organizations)
            ? membership.organizations[0] ?? null
            : membership.organizations

        if (!isActiveOrganizationSummary(organizationCandidate) || seen.has(organizationCandidate.id)) {
            continue
        }

        seen.add(organizationCandidate.id)
        organizations.push(organizationCandidate)
    }

    organizations.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return organizations
}

async function getOrganizationsFromMemberships(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
) {
    const { data: memberships, error } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(id, name, slug)')
        .eq('user_id', userId)

    if (error) {
        console.warn('Failed to resolve organizations from memberships fallback:', error)
        return [] as ActiveOrganizationSummary[]
    }

    return buildOrganizationsFromMemberships((memberships ?? []) as MembershipWithOrganization[])
}

async function getOrganizationById(
    supabase: Awaited<ReturnType<typeof createClient>>,
    organizationId: string
): Promise<ActiveOrganizationSummary | null> {
    const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .eq('id', organizationId)
        .maybeSingle()

    if (error) {
        console.warn('Failed to resolve active organization by cookie id:', error)
        return null
    }

    if (!isActiveOrganizationSummary(data)) return null
    if (isExcludedForSystemAdminOrganizationList(data)) return null

    return data
}

async function getFirstOrganization(
    supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ActiveOrganizationSummary | null> {
    const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .order('name', { ascending: true })
        .limit(20)

    if (error) {
        console.warn('Failed to resolve fallback organization for system admin:', error)
        return null
    }

    const organizations = (data ?? []).filter(isActiveOrganizationSummary)
    return filterExcludedSystemAdminOrganizations(organizations)[0] ?? null
}

async function getAccessibleOrganizationsForContext(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userContext: UserContext
) {
    if (userContext.isSystemAdmin) {
        const { data: organizationsData, error } = await supabase
            .from('organizations')
            .select('id, name, slug')
            .order('name', { ascending: true })

        const organizations = (organizationsData ?? []).filter(isActiveOrganizationSummary)
        if (!error && organizations.length > 0) {
            return filterExcludedSystemAdminOrganizations(organizations)
        }

        if (error) {
            console.warn('System admin organization list query failed, using membership fallback:', error)
        }

        const membershipOrganizations = await getOrganizationsFromMemberships(supabase, userContext.userId)
        return filterExcludedSystemAdminOrganizations(membershipOrganizations)
    }

    return getOrganizationsFromMemberships(supabase, userContext.userId)
}

export async function getAccessibleOrganizationsForUser(
    supabaseOverride?: Awaited<ReturnType<typeof createClient>>
): Promise<{ userContext: UserContext; organizations: ActiveOrganizationSummary[] } | null> {
    const supabase = supabaseOverride ?? await createClient()
    const userContext = await getCurrentUserContext(supabase)
    if (!userContext) return null
    const organizations = await getAccessibleOrganizationsForContext(supabase, userContext)

    return {
        userContext,
        organizations
    }
}

export async function resolveActiveOrganizationContext(
    supabaseOverride?: Awaited<ReturnType<typeof createClient>>,
    options?: ResolveActiveOrganizationContextOptions
): Promise<ActiveOrganizationContext | null> {
    if (!supabaseOverride) {
        const includeAccessibleOrganizations = options?.includeAccessibleOrganizations ?? null
        return resolveActiveOrganizationContextCached(includeAccessibleOrganizations)
    }

    return resolveActiveOrganizationContextWithSupabase(supabaseOverride, options)
}

const resolveActiveOrganizationContextCached = cache(async (includeAccessibleOrganizations: boolean | null) => {
    const supabase = await createClient()
    const options = includeAccessibleOrganizations === null
        ? undefined
        : { includeAccessibleOrganizations }

    return resolveActiveOrganizationContextWithSupabase(supabase, options)
})

async function resolveActiveOrganizationContextWithSupabase(
    supabase: Awaited<ReturnType<typeof createClient>>,
    options?: ResolveActiveOrganizationContextOptions
): Promise<ActiveOrganizationContext | null> {
    const userContext = await getCurrentUserContext(supabase)
    if (!userContext) return null
    const cookieStore = await cookies()
    const cookieOrganizationId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null
    const includeAccessibleOrganizations = options?.includeAccessibleOrganizations ?? !userContext.isSystemAdmin

    if (userContext.isSystemAdmin && !includeAccessibleOrganizations) {
        const cookieOrganization = cookieOrganizationId
            ? await getOrganizationById(supabase, cookieOrganizationId)
            : null

        let fallbackOrganization: ActiveOrganizationSummary | null = null
        if (!cookieOrganization) {
            fallbackOrganization = await getFirstOrganization(supabase)
            if (!fallbackOrganization) {
                const fallbackOrganizations = filterExcludedSystemAdminOrganizations(
                    await getOrganizationsFromMemberships(supabase, userContext.userId)
                )
                fallbackOrganization = fallbackOrganizations[0] ?? null
            }
        }

        const activeOrganization = cookieOrganization ?? fallbackOrganization
        const source: ActiveOrganizationContext['source'] = activeOrganization
            ? (cookieOrganization ? 'cookie' : 'fallback')
            : 'none'

        return {
            userId: userContext.userId,
            isSystemAdmin: userContext.isSystemAdmin,
            userFullName: userContext.userFullName,
            userEmail: userContext.userEmail,
            accessibleOrganizations: activeOrganization ? [activeOrganization] : [],
            activeOrganizationId: activeOrganization?.id ?? null,
            activeOrganization,
            source,
            readOnlyTenantMode: userContext.isSystemAdmin
        }
    }

    const organizations = await getAccessibleOrganizationsForContext(supabase, userContext)

    const fallbackOrganization = organizations[0] ?? null
    const cookieOrganization = cookieOrganizationId
        ? organizations.find((organization) => organization.id === cookieOrganizationId) ?? null
        : null

    const activeOrganization = cookieOrganization ?? fallbackOrganization
    const source: ActiveOrganizationContext['source'] = activeOrganization
        ? (cookieOrganization ? 'cookie' : 'fallback')
        : 'none'

    return {
        userId: userContext.userId,
        isSystemAdmin: userContext.isSystemAdmin,
        userFullName: userContext.userFullName,
        userEmail: userContext.userEmail,
        accessibleOrganizations: organizations,
        activeOrganizationId: activeOrganization?.id ?? null,
        activeOrganization,
        source,
        // System admin should only observe tenant modules while impersonating organizations.
        readOnlyTenantMode: userContext.isSystemAdmin
    }
}

export async function assertSystemAdmin(
    supabaseOverride?: Awaited<ReturnType<typeof createClient>>
): Promise<UserContext> {
    const userContext = await getCurrentUserContext(supabaseOverride)
    if (!userContext) {
        throw new Error('Unauthorized')
    }

    if (!userContext.isSystemAdmin) {
        throw new Error('Forbidden')
    }

    return userContext
}

export async function assertTenantWriteAllowed(
    supabaseOverride?: Awaited<ReturnType<typeof createClient>>
) {
    const userContext = await getCurrentUserContext(supabaseOverride)
    if (!userContext) {
        throw new Error('Unauthorized')
    }

    if (userContext.isSystemAdmin) {
        throw new Error('Read-only impersonation mode')
    }

    return userContext
}
