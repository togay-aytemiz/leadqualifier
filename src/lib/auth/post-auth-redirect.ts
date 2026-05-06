import { resolvePostAuthRoute } from '@/lib/auth/post-auth-route'

interface PostAuthSupabaseQueryResult<T> {
  data: T | null
  error: unknown
}

interface PostAuthSupabaseMaybeSingleQuery<T> {
  maybeSingle: () => Promise<PostAuthSupabaseQueryResult<T>>
}

interface PostAuthSupabaseFilterQuery<T> {
  eq: (column: string, value: string) => PostAuthSupabaseMaybeSingleQuery<T>
}

interface PostAuthSupabaseSelectQuery<T> {
  select: (columns: string) => PostAuthSupabaseFilterQuery<T>
}

export interface PostAuthSupabase {
  from: (table: string) => PostAuthSupabaseSelectQuery<Record<string, unknown>>
}

interface ResolvePostAuthRedirectPathInput {
  cookieOrganizationId: string | null
  locale: string | null | undefined
  onboarding?: {
    shouldAutoOpen?: boolean
    resolveOrganizationId?: () => Promise<string | null>
  }
  supabase: PostAuthSupabase
  userId: string
}

export function resolvePostAuthHomeRoute({
  isSystemAdmin,
  hasExplicitOrganizationSelection,
}: {
  isSystemAdmin: boolean
  hasExplicitOrganizationSelection: boolean
}) {
  return resolvePostAuthRoute({
    isSystemAdmin,
    hasExplicitOrganizationSelection,
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
    .maybeSingle()

  if (error) {
    console.warn('Failed to validate post-auth organization selection:', error)
    return false
  }

  return typeof data?.id === 'string'
}

export async function resolvePostAuthRedirectPath({
  cookieOrganizationId,
  locale,
  onboarding,
  supabase,
  userId,
}: ResolvePostAuthRedirectPathInput) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_system_admin')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.warn('Failed to resolve post-auth profile:', error)
  }

  const isSystemAdmin = Boolean(profile?.is_system_admin)
  const hasExplicitOrganizationSelection = isSystemAdmin
    ? await isExplicitOrganizationSelectionValid(supabase, cookieOrganizationId)
    : true

  const homeRoute = resolvePostAuthHomeRoute({
    isSystemAdmin,
    hasExplicitOrganizationSelection,
  })

  if (homeRoute === '/inbox' && onboarding?.shouldAutoOpen) {
    return '/onboarding'
  }

  return homeRoute
}
