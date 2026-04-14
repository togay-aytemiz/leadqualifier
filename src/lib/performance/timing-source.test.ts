import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DASHBOARD_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/layout.tsx')
const DASHBOARD_SHELL_DATA_PATH = path.resolve(process.cwd(), 'src/lib/dashboard/shell-data.ts')
const SETTINGS_LAYOUT_PATH = path.resolve(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/layout.tsx'
)
const CALENDAR_PAGE_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/calendar/page.tsx')
const CALENDAR_ACTIONS_PATH = path.resolve(process.cwd(), 'src/lib/calendar/actions.ts')
const ROUTE_INTL_PROVIDER_PATH = path.resolve(
    process.cwd(),
    'src/components/i18n/DashboardRouteIntlProvider.tsx'
)

describe('dashboard performance timing source guards', () => {
    it('instruments the root dashboard shell critical path', () => {
        const source = fs.readFileSync(DASHBOARD_LAYOUT_PATH, 'utf8')
        const shellDataSource = fs.readFileSync(DASHBOARD_SHELL_DATA_PATH, 'utf8')

        expect(source).toContain('getDashboardShellData')
        expect(shellDataSource).toContain("from '@/lib/performance/timing'")
        expect(shellDataSource).toContain("'dashboard.layout.orgContext'")
        expect(shellDataSource).toContain("'dashboard.layout.messages'")
        expect(shellDataSource).toContain("'dashboard.layout.billingAndOnboarding'")
        expect(shellDataSource).toContain("'dashboard.layout.aiSettings'")
    })

    it('instruments settings layout context and route message loading', () => {
        const layoutSource = fs.readFileSync(SETTINGS_LAYOUT_PATH, 'utf8')
        const providerSource = fs.readFileSync(ROUTE_INTL_PROVIDER_PATH, 'utf8')

        expect(layoutSource).toContain("'settings.layout.orgContext'")
        expect(layoutSource).toContain("const SETTINGS_ROUTE_MESSAGES_TIMING_LABEL = 'settings.layout.routeMessages'")
        expect(layoutSource).toContain('timingLabel={SETTINGS_ROUTE_MESSAGES_TIMING_LABEL}')
        expect(providerSource).toContain('timingLabel')
        expect(providerSource).toContain('withDevTiming(')
        expect(providerSource).toContain('timingLabel,')
    })

    it('instruments calendar initial page data loading', () => {
        const source = fs.readFileSync(CALENDAR_PAGE_PATH, 'utf8')

        expect(source).toContain("'calendar.page.orgContext'")
        expect(source).toContain("'calendar.page.billing'")
        expect(source).toContain("'calendar.page.settings'")
        expect(source).toContain("'calendar.page.data'")
    })

    it('instruments calendar data server action cache misses', () => {
        const source = fs.readFileSync(CALENDAR_ACTIONS_PATH, 'utf8')

        expect(source).toContain("'calendar.action.getPageData.requireOrg'")
        expect(source).toContain("'calendar.action.getPageData.data'")
    })
})
