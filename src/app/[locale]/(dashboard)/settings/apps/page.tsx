import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { ApplicationsSettingsClient } from '@/components/settings/ApplicationsSettingsClient'
import {
    getBookingSettingsByOrganizationId,
    getCalendarConnectionByOrganizationId
} from '@/lib/calendar/bookings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

export default async function SettingsApplicationsPage() {
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
        currentPath: '/settings/apps',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const [bookingSettings, calendarConnection] = await Promise.all([
        getBookingSettingsByOrganizationId(supabase, organizationId),
        getCalendarConnectionByOrganizationId(supabase, organizationId)
    ])

    return (
        <ApplicationsSettingsClient
            initialSettings={bookingSettings}
            initialConnection={calendarConnection}
            isReadOnly={orgContext?.readOnlyTenantMode ?? false}
        />
    )
}
