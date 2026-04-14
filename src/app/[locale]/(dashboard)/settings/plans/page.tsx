import { Suspense } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader, Skeleton } from '@/design'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'
import PlansSettingsPageContent, { type PlansSettingsSearchParams } from './PlansSettingsPageContent'

interface PlansSettingsPageProps {
    searchParams: Promise<PlansSettingsSearchParams>
}

function PlansSettingsPageSkeleton() {
    return (
        <div className="flex-1 overflow-auto p-8">
            <div className="max-w-6xl space-y-6">
                <Skeleton className="h-5 w-80" />
                <Skeleton className="h-52 w-full rounded-2xl" />
                <Skeleton className="h-96 w-full rounded-2xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
        </div>
    )
}

export default async function PlansSettingsPage({ searchParams }: PlansSettingsPageProps) {
    const locale = await getLocale()
    const tPlans = await getTranslations('billingPlans')
    const search = await searchParams

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <>
                <PageHeader title={tPlans('pageTitle')} />

                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">{tPlans('noOrganization')}</h2>
                        <p>{tPlans('noOrganizationDesc')}</p>
                    </div>
                </div>
            </>
        )
    }

    return (
        <DashboardRouteIntlProvider includeDashboardShell={false} namespaces={['billingPlans']}>
            <PageHeader title={tPlans('pageTitle')} />

            <Suspense fallback={<PlansSettingsPageSkeleton />}>
                <PlansSettingsPageContent
                    organizationId={organizationId}
                    locale={locale}
                    search={search}
                />
            </Suspense>
        </DashboardRouteIntlProvider>
    )
}
