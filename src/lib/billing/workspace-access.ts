import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import type { Database } from '@/types/database'
import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import { getOrganizationBillingSnapshot } from '@/lib/billing/server'

type SupabaseClientLike = SupabaseClient<Database>

const BILLING_ONLY_ALLOWED_PATHS = ['/settings/plans', '/settings/billing'] as const

export interface WorkspaceAccessState {
    isLocked: boolean
    mode: 'full' | 'billing_only'
}

function normalizePath(pathname: string) {
    if (!pathname) return '/'
    return pathname.startsWith('/') ? pathname : `/${pathname}`
}

function buildLocalizedPath(locale: string, pathname: string) {
    const normalized = normalizePath(pathname)
    if (locale === 'tr') return normalized
    return `/${locale}${normalized}`
}

export function isBillingOnlyPath(pathname: string) {
    const normalized = normalizePath(pathname)
    return BILLING_ONLY_ALLOWED_PATHS.some((candidate) => (
        normalized === candidate || normalized.startsWith(`${candidate}/`)
    ))
}

export function resolveWorkspaceAccessState(
    snapshot: OrganizationBillingSnapshot | null | undefined
): WorkspaceAccessState {
    if (!snapshot) {
        return {
            isLocked: false,
            mode: 'full'
        }
    }

    if (snapshot.isUsageAllowed) {
        return {
            isLocked: false,
            mode: 'full'
        }
    }

    return {
        isLocked: true,
        mode: 'billing_only'
    }
}

export async function enforceWorkspaceAccessOrRedirect(options: {
    organizationId: string | null
    locale: string
    currentPath: string
    supabase?: SupabaseClientLike
    bypassLock?: boolean
}) {
    if (!options.organizationId) return
    if (options.bypassLock) return
    if (isBillingOnlyPath(options.currentPath)) return

    const snapshot = await getOrganizationBillingSnapshot(options.organizationId, {
        supabase: options.supabase
    })
    const access = resolveWorkspaceAccessState(snapshot)
    if (!access.isLocked) return

    const params = new URLSearchParams({
        locked: '1'
    })

    const lockReason = snapshot?.lockReason
    if (lockReason && lockReason !== 'none') {
        params.set('reason', lockReason)
    }

    redirect(`${buildLocalizedPath(options.locale, '/settings/plans')}?${params.toString()}`)
}

