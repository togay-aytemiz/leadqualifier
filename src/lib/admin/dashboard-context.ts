import type { ActiveOrganizationContext, ActiveOrganizationSummary } from '@/lib/organizations/active-context'

export interface AdminDashboardOrganizationContext {
    hasExplicitSelection: boolean
    activeOrganization: ActiveOrganizationSummary | null
}

export function resolveAdminDashboardOrganizationContext(
    orgContext: ActiveOrganizationContext | null
): AdminDashboardOrganizationContext {
    if (!orgContext) {
        return {
            hasExplicitSelection: false,
            activeOrganization: null
        }
    }

    const hasExplicitSelection = orgContext.isSystemAdmin
        ? orgContext.source === 'cookie' && Boolean(orgContext.activeOrganizationId)
        : Boolean(orgContext.activeOrganizationId)

    return {
        hasExplicitSelection,
        activeOrganization: hasExplicitSelection ? orgContext.activeOrganization : null
    }
}
