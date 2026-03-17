import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/design'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'
import {
  getBookingSettingsByOrganizationId,
  getCalendarPageDataByOrganizationId,
} from '@/lib/calendar/bookings'
import {
  buildCalendarDataWindow,
  getTodayDateKey,
  normalizeCalendarView,
} from '@/lib/calendar/presentation'
import { CalendarClient } from '@/components/calendar/CalendarClient'

interface PageProps {
  searchParams: Promise<{ view?: string; date?: string }>
}

function isValidDateKey(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

export default async function CalendarWorkspacePage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const locale = await getLocale()
  const t = await getTranslations('calendar')
  const orgContext = await resolveActiveOrganizationContext()

  if (!orgContext) {
    redirect(`/${locale}/login`)
  }

  const organizationId = orgContext.activeOrganizationId ?? null

  if (!organizationId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <PageHeader title={t('title')} />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h2 className="text-xl font-semibold text-slate-900">{t('noOrganization.title')}</h2>
            <p className="mt-2 text-sm text-slate-500">{t('noOrganization.description')}</p>
          </div>
        </div>
      </div>
    )
  }

  await enforceWorkspaceAccessOrRedirect({
    organizationId,
    locale,
    currentPath: '/calendar',
    bypassLock: orgContext.isSystemAdmin ?? false,
  })

  const params = await searchParams
  const settings = await getBookingSettingsByOrganizationId(supabase, organizationId)
  const initialView = normalizeCalendarView(params.view)
  const anchorDate = isValidDateKey(params.date)
    ? String(params.date)
    : getTodayDateKey(settings.timezone)
  const dataWindow = buildCalendarDataWindow({
    anchorDate,
    timeZone: settings.timezone,
  })
  const data = await getCalendarPageDataByOrganizationId(supabase, organizationId, {
    rangeStartIso: dataWindow.rangeStartIso,
    rangeEndIso: dataWindow.rangeEndIso,
    settings,
  })

  return (
    <CalendarClient
      data={data}
      initialAnchorDate={anchorDate}
      initialHasExplicitView={Boolean(params.view)}
      initialView={initialView}
      locale={locale}
      readOnlyTenantMode={orgContext.readOnlyTenantMode ?? false}
    />
  )
}
