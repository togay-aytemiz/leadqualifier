import { resolvePostAuthRoute } from '@/lib/auth/post-auth-route'
import { buildLocalizedPath, normalizeAppLocale } from '@/lib/i18n/locale-path'

interface PostAuthSupabaseQueryResult<T> {
    data: T | null
    error: unknown
}

interface PostAuthSupabase {
    from: (table: string) => any
}

interface ResolvePostAuthRedirectPathInput {
    cookieOrganizationId: string | null
    locale: string | null | undefined
    supabase: PostAuthSupabase
    userId: string
}

export function resolvePostAuthHomeRoute({
    isSystemAdmin,
    hasExplicitOrganizationSelection
}: {
    isSystemAdmin: boolean
    hasExplicitOrganizationSelection: boolean
}) {
    return resolvePostAuthRoute({
        isSystemAdmin,
        hasExplicitOrganizationSelection
    })
}

async function isExplicitOrganizationSelectionValid(
    supabase: PostAuthSupabase,
    cookieOrganizationId: string | null
) {
    if (!cookieOrganizationId) {
        return false
    }

    const { data, error } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', cookieOrganizationId)
        .maybeSingle() as PostAuthSupabaseQueryResult<Record<string, unknown>>

    if (error) {
        console.warn('Failed to validate post-auth organization selection:', error)
        return false
    }

    return typeof data?.id === 'string'
}

export async function resolvePostAuthRedirectPath({
    cookieOrganizationId,
    locale,
    supabase,
    userId
}: ResolvePostAuthRedirectPathInput) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_system_admin')
        .eq('id', userId)
        .maybeSingle() as PostAuthSupabaseQueryResult<Record<string, unknown>>

    if (error) {
        console.warn('Failed to resolve post-auth profile:', error)
    }

    const isSystemAdmin = Boolean(profile?.is_system_admin)
    const hasExplicitOrganizationSelection = isSystemAdmin
        ? await isExplicitOrganizationSelectionValid(supabase, cookieOrganizationId)
        : true

    return buildLocalizedPath(
        resolvePostAuthHomeRoute({
            isSystemAdmin,
            hasExplicitOrganizationSelection
        }),
        normalizeAppLocale(locale)
    )
}
