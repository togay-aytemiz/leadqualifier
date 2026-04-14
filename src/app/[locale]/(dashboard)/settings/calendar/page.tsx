import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { CalendarSettingsClient } from '@/components/settings/CalendarSettingsClient'
import {
    getBookableServiceCatalogItemsByOrganizationId,
    getBookingAvailabilityRulesByOrganizationId,
    getBookingSettingsByOrganizationId,
    getCalendarConnectionByOrganizationId
} from '@/lib/calendar/bookings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'
import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'

export default async function CalendarSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const t = await getTranslations('calendar')

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{t('noOrganization.title')}</h2>
                    <p>{t('noOrganization.description')}</p>
                </div>
            </div>
        )
    }

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: '/settings/calendar',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const [
        bookingSettings,
        availabilityRules,
        services,
        calendarConnection
    ] = await Promise.all([
        getBookingSettingsByOrganizationId(supabase, organizationId),
        getBookingAvailabilityRulesByOrganizationId(supabase, organizationId),
        getBookableServiceCatalogItemsByOrganizationId(supabase, organizationId),
        getCalendarConnectionByOrganizationId(supabase, organizationId)
    ])

    return (
        <DashboardRouteIntlProvider includeDashboardShell={false} namespaces={['calendar', 'Sidebar']}>
            <CalendarSettingsClient
                initialSettings={bookingSettings}
                initialAvailabilityRules={availabilityRules}
                initialServices={services}
                initialConnection={calendarConnection}
                isReadOnly={orgContext?.readOnlyTenantMode ?? false}
            />
        </DashboardRouteIntlProvider>
    )
}
