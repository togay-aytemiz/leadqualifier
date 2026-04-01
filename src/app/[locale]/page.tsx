import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { resolveDefaultHomeRoute } from '@/lib/navigation/default-home-route'
import { getOrganizationOnboardingState } from '@/lib/onboarding/state'
import { hasSupabaseAuthCookie } from '@/lib/auth/supabase-auth-cookie'

export default async function LocaleEntryPage() {
    const cookieStore = await cookies()
    if (!hasSupabaseAuthCookie(cookieStore.getAll())) {
        redirect('/login')
    }

    const orgContext = await resolveActiveOrganizationContext()
    const onboardingState = orgContext?.activeOrganizationId
        ? await getOrganizationOnboardingState(orgContext.activeOrganizationId)
        : null

    redirect(resolveDefaultHomeRoute(orgContext, { onboarding: onboardingState }))
}
