import { resolveAdminDashboardOrganizationContext } from '@/lib/admin/dashboard-context'
import type { ActiveOrganizationContext } from '@/lib/organizations/active-context'

export function resolveDefaultHomeRoute(
    orgContext: ActiveOrganizationContext | null
): '/login' | '/admin' | '/inbox' {
    if (!orgContext) {
        return '/login'
    }

    const adminDashboardContext = resolveAdminDashboardOrganizationContext(orgContext)
    if (orgContext.isSystemAdmin && !adminDashboardContext.hasExplicitSelection) {
        return '/admin'
    }

    return '/inbox'
}
