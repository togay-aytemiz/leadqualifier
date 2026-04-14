import { Suspense } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Skeleton } from '@/design'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'
import BillingSettingsPageContent from './BillingSettingsPageContent'

function BillingSettingsPageSkeleton() {
    return (
        <div className="flex-1 overflow-auto p-8">
            <div className="max-w-5xl space-y-6">
                <Skeleton className="h-28 w-full rounded-2xl" />
                <Skeleton className="h-48 w-full rounded-2xl" />
                <Skeleton className="h-72 w-full rounded-2xl" />
            </div>
        </div>
    )
}

export default async function BillingSettingsPage() {
    const locale = await getLocale()
    const tBilling = await getTranslations('billingUsage')

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <>
                <PageHeader title={tBilling('pageTitle')} />

                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">{tBilling('noOrganization')}</h2>
                        <p>{tBilling('noOrganizationDesc')}</p>
                    </div>
                </div>
            </>
        )
    }

    return (
        <DashboardRouteIntlProvider includeDashboardShell={false} namespaces={['billingUsage']}>
            <PageHeader title={tBilling('pageTitle')} />

            <Suspense fallback={<BillingSettingsPageSkeleton />}>
                <BillingSettingsPageContent organizationId={organizationId} locale={locale} />
            </Suspense>
        </DashboardRouteIntlProvider>
    )
}
