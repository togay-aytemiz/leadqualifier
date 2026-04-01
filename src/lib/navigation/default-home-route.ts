import { resolveAdminDashboardOrganizationContext } from '@/lib/admin/dashboard-context'
import type { ActiveOrganizationContext } from '@/lib/organizations/active-context'
import type { OrganizationOnboardingShellState } from '@/lib/onboarding/state'

export function resolveDefaultHomeRoute(
    orgContext: ActiveOrganizationContext | null,
    options?: { onboarding?: OrganizationOnboardingShellState | null }
): '/login' | '/admin' | '/inbox' | '/onboarding' {
    if (!orgContext) {
        return '/login'
    }

    const adminDashboardContext = resolveAdminDashboardOrganizationContext(orgContext)
    if (orgContext.isSystemAdmin && !adminDashboardContext.hasExplicitSelection) {
        return '/admin'
    }

    if (options?.onboarding?.shouldAutoOpen) {
        return '/onboarding'
    }

    return '/inbox'
}
