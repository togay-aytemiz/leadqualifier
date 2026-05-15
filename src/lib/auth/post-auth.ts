import { cookies } from 'next/headers'

import { ACTIVE_ORG_COOKIE } from '@/lib/organizations/active-context'
import { getOrganizationOnboardingState } from '@/lib/onboarding/state'
import { createClient } from '@/lib/supabase/server'
import {
    resolvePostAuthRedirectPath,
    type PostAuthSupabase,
} from '@/lib/auth/post-auth-redirect'

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

async function resolvePostAuthOrganizationId(
    supabase: ServerSupabaseClient,
    userId: string
) {
    const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()

    if (error) {
        console.warn('Failed to resolve post-auth organization for onboarding:', error)
        return null
    }

    return typeof data?.organization_id === 'string'
        ? data.organization_id
        : null
}

export async function buildPostAuthRedirectPath(
    locale: string | null | undefined,
    supabase: ServerSupabaseClient,
    userId: string | null | undefined
) {
    if (!userId) {
        return '/inbox'
    }

    try {
        const cookieStore = await cookies()
        const organizationId = await resolvePostAuthOrganizationId(
            supabase,
            userId
        )
        const onboardingState = organizationId
            ? await getOrganizationOnboardingState(organizationId, {
                supabase
            })
            : null

        return resolvePostAuthRedirectPath({
            cookieOrganizationId: cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null,
            locale,
            onboarding: {
                shouldAutoOpen: onboardingState?.shouldAutoOpen ?? false,
                resolveOrganizationId: async () => organizationId
            },
            supabase: supabase as unknown as PostAuthSupabase,
            userId
        })
    } catch (error) {
        console.error('Failed to resolve post-auth redirect path:', error)
        return '/inbox'
    }
}
