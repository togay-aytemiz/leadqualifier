import { isBillingOnlyPath } from '@/lib/billing/workspace-access'

const LOCKED_SETTINGS_REDIRECT_PATH = '/settings/plans'

interface BillingLockedNavItemInput {
    id: string
    href?: string
}

interface BillingLockedNavItemState {
    href?: string
    isLocked: boolean
}

export function resolveBillingLockedNavItem(
    item: BillingLockedNavItemInput,
    workspaceLocked: boolean
): BillingLockedNavItemState {
    if (!item.href) {
        return {
            href: item.href,
            isLocked: false
        }
    }

    const resolvedHref = workspaceLocked && item.id === 'settings'
        ? LOCKED_SETTINGS_REDIRECT_PATH
        : item.href

    return {
        href: resolvedHref,
        isLocked: workspaceLocked && !isBillingOnlyPath(resolvedHref)
    }
}
