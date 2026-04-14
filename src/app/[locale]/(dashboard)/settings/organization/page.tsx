import { Suspense } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { Skeleton } from '@/design'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'
import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'
import OrganizationSettingsPageContent from './OrganizationSettingsPageContent'

function OrganizationSettingsPageSkeleton() {
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            <div className="h-14 shrink-0 border-b border-gray-200 bg-white px-6">
                <div className="flex h-full items-center justify-between gap-4">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl space-y-6">
                    <Skeleton className="h-10 w-72 rounded-xl" />
                    <Skeleton className="h-32 w-full rounded-2xl" />
                    <Skeleton className="h-64 w-full rounded-2xl" />
                </div>
            </div>
        </div>
    )
}

export default async function OrganizationSettingsPage() {
    const locale = await getLocale()
    const tOrg = await getTranslations('organizationSettings')

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{tOrg('noOrganization')}</h2>
                    <p>{tOrg('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: '/settings/organization',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    return (
        <DashboardRouteIntlProvider includeDashboardShell={false} namespaces={['organizationSettings', 'unsavedChanges']}>
            <Suspense fallback={<OrganizationSettingsPageSkeleton />}>
                <OrganizationSettingsPageContent
                    organizationId={organizationId}
                    locale={locale as 'en' | 'tr'}
                    isReadOnly={orgContext?.readOnlyTenantMode ?? false}
                />
            </Suspense>
        </DashboardRouteIntlProvider>
    )
}
