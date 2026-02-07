import { cookies } from 'next/headers'
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

export async function getAccessibleOrganizationsForUser(
    supabaseOverride?: Awaited<ReturnType<typeof createClient>>
): Promise<{ userContext: UserContext; organizations: ActiveOrganizationSummary[] } | null> {
    const supabase = supabaseOverride ?? await createClient()
    const userContext = await getCurrentUserContext(supabase)
    if (!userContext) return null

    if (userContext.isSystemAdmin) {
        const { data: organizationsData } = await supabase
            .from('organizations')
            .select('id, name, slug')
            .order('name', { ascending: true })

        const organizations = (organizationsData ?? []).filter(isActiveOrganizationSummary)

        return {
            userContext,
            organizations
        }
    }

    const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(id, name, slug)')
        .eq('user_id', userContext.userId)

    const seen = new Set<string>()
    const organizations: ActiveOrganizationSummary[] = []
    for (const membership of memberships ?? []) {
        const organizationCandidate = Array.isArray(membership.organizations)
            ? membership.organizations[0] ?? null
            : membership.organizations
        if (!isActiveOrganizationSummary(organizationCandidate) || seen.has(organizationCandidate.id)) continue
        const organization = organizationCandidate
        seen.add(organization.id)
        organizations.push(organization)
    }

    organizations.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    return {
        userContext,
        organizations
    }
}

export async function resolveActiveOrganizationContext(
    supabaseOverride?: Awaited<ReturnType<typeof createClient>>
): Promise<ActiveOrganizationContext | null> {
    const access = await getAccessibleOrganizationsForUser(supabaseOverride)
    if (!access) return null

    const { userContext, organizations } = access
    const cookieStore = await cookies()
    const cookieOrganizationId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null

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
