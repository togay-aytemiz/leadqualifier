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
    accessibleOrganizations: ActiveOrganizationSummary[]
    activeOrganizationId: string | null
    activeOrganization: ActiveOrganizationSummary | null
    source: 'cookie' | 'fallback' | 'none'
    readOnlyTenantMode: boolean
}

interface UserContext {
    userId: string
    isSystemAdmin: boolean
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

function isActiveOrganizationSummary(value: unknown): value is ActiveOrganizationSummary {
    if (typeof value !== 'object' || value === null) return false

    const candidate = value as Record<string, unknown>
    return (
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.slug === 'string'
    )
}

async function getCurrentUserContext(supabaseOverride?: Awaited<ReturnType<typeof createClient>>): Promise<UserContext | null> {
    const supabase = supabaseOverride ?? await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_system_admin')
        .eq('id', user.id)
        .single()

    return {
        userId: user.id,
        isSystemAdmin: Boolean(profile?.is_system_admin)
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

    return isActiveOrganizationSummary(data) ? data : null
}

async function getFirstOrganization(
    supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ActiveOrganizationSummary | null> {
    const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .order('name', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (error) {
        console.warn('Failed to resolve fallback organization for system admin:', error)
        return null
    }

    return isActiveOrganizationSummary(data) ? data : null
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
            return organizations
        }

        if (error) {
            console.warn('System admin organization list query failed, using membership fallback:', error)
        }

        const membershipOrganizations = await getOrganizationsFromMemberships(supabase, userContext.userId)
        return membershipOrganizations
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
                const fallbackOrganizations = await getOrganizationsFromMemberships(supabase, userContext.userId)
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
