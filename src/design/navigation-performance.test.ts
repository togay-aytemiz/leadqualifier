import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN_SIDEBAR_PATH = path.join(process.cwd(), 'src/design/MainSidebar.tsx')
const MOBILE_BOTTOM_NAV_PATH = path.join(process.cwd(), 'src/design/MobileBottomNav.tsx')
const SIDEBAR_PATH = path.join(process.cwd(), 'src/design/Sidebar.tsx')
const SETTINGS_SHELL_PATH = path.join(process.cwd(), 'src/components/settings/SettingsResponsiveShell.tsx')
const SETTINGS_LOADING_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/settings/loading.tsx')
const SETTINGS_ORGANIZATION_PAGE_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/settings/organization/page.tsx')
const SETTINGS_ORGANIZATION_CLIENT_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/settings/organization/OrganizationSettingsClient.tsx')
const SETTINGS_BILLING_PAGE_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/settings/billing/page.tsx')
const SETTINGS_PLANS_PAGE_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/settings/plans/page.tsx')
const SETTINGS_PLAN_MANAGER_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx')
const SETTINGS_PLAN_CATALOG_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanCatalog.tsx')
const SETTINGS_TOPUP_CARD_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.tsx')
const TAB_TITLE_SYNC_PATH = path.join(process.cwd(), 'src/components/common/TabTitleSync.tsx')
const DASHBOARD_LAYOUT_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/layout.tsx')
const INBOX_PAGE_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/inbox/page.tsx')
const CALENDAR_PAGE_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/calendar/page.tsx')
const LEADS_PAGE_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/leads/page.tsx')
const SKILLS_PAGE_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/skills/page.tsx')
const KNOWLEDGE_PAGE_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/knowledge/page.tsx')

describe('navigation performance source guards', () => {
    it('keeps primary nav routes warm while preserving configurable shell prefetch control', () => {
        const sidebarSource = fs.readFileSync(SIDEBAR_PATH, 'utf8')
        const mainSidebarSource = fs.readFileSync(MAIN_SIDEBAR_PATH, 'utf8')
        const mobileBottomNavSource = fs.readFileSync(MOBILE_BOTTOM_NAV_PATH, 'utf8')
        const settingsShellSource = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

        expect(sidebarSource).toContain('prefetch = false')
        expect(sidebarSource).toContain('prefetch={prefetch}')
        expect(sidebarSource).toContain('onMouseEnter={onNavigateIntent}')
        expect(settingsShellSource).not.toMatch(/href=\{item\.href\}\s+prefetch\s+active=\{item\.active\}/)
        expect(mainSidebarSource).toContain('href={itemHref}')
        expect(mainSidebarSource).toContain('title={collapsed ? undefined : item.label}')
        expect(mobileBottomNavSource).toContain('href={item.href}')
        expect(mobileBottomNavSource).toContain('className={cn(')
    })

    it('defers non-critical main sidebar hydration work', () => {
        const mainSidebarSource = fs.readFileSync(MAIN_SIDEBAR_PATH, 'utf8')

        expect(mainSidebarSource).toContain('deferredLoadTimer = window.setTimeout(() => {')
        expect(mainSidebarSource).toContain('void refreshPendingSuggestions(organizationId)')
        expect(mainSidebarSource).toContain('void refreshBillingSnapshot(organizationId)')
    })

    it('skips mobile billing hydration on desktop viewports', () => {
        const mobileBottomNavSource = fs.readFileSync(MOBILE_BOTTOM_NAV_PATH, 'utf8')

        expect(mobileBottomNavSource).toContain("window.matchMedia('(min-width: 1024px)')")
        expect(mobileBottomNavSource).toContain('if (!activeOrganizationId || isDesktopViewport !== false) {')
    })

    it('keeps unread checks lightweight and desktop tab title sync tied to shared shell state', () => {
        const mainSidebarSource = fs.readFileSync(MAIN_SIDEBAR_PATH, 'utf8')
        const tabTitleSyncSource = fs.readFileSync(TAB_TITLE_SYNC_PATH, 'utf8')

        expect(mainSidebarSource).toContain('.select(\'id\')')
        expect(mainSidebarSource).toContain('.limit(1)')
        expect(mainSidebarSource).toContain('dispatchInboxUnreadState')
        expect(tabTitleSyncSource).toContain('listenForInboxUnreadState')
        expect(tabTitleSyncSource).toContain("window.matchMedia('(min-width: 1024px)')")
    })

    it('gates main sidebar IO to desktop viewports only', () => {
        const mainSidebarSource = fs.readFileSync(MAIN_SIDEBAR_PATH, 'utf8')

        expect(mainSidebarSource).toContain('const [isDesktopViewport, setIsDesktopViewport] = useState<boolean | null>(null)')
        expect(mainSidebarSource).toContain("window.matchMedia('(min-width: 1024px)')")
        expect(mainSidebarSource).toContain('if (isDesktopViewport !== true) return')
    })

    it('uses an optimistic dashboard path so nav active state updates before route commit', () => {
        const mainSidebarSource = fs.readFileSync(MAIN_SIDEBAR_PATH, 'utf8')
        const mobileBottomNavSource = fs.readFileSync(MOBILE_BOTTOM_NAV_PATH, 'utf8')
        const settingsShellSource = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

        expect(mainSidebarSource).toContain('useDashboardRouteState(pathname)')
        expect(mainSidebarSource).toContain('activePath')
        expect(mobileBottomNavSource).toContain('useDashboardRouteState(pathname)')
        expect(mobileBottomNavSource).toContain('activePath')
        expect(settingsShellSource).toContain('useDashboardRouteState(pathname)')
        expect(settingsShellSource).toContain('activePath')
    })

    it('avoids stacking the global pending overlay on top of inbox and leads segment loaders', () => {
        const transitionViewportSource = fs.readFileSync(
            path.join(process.cwd(), 'src/components/common/DashboardRouteTransitionViewport.tsx'),
            'utf8'
        )

        expect(transitionViewportSource).toContain("pendingSkeleton !== 'inbox'")
        expect(transitionViewportSource).toContain("pendingSkeleton !== 'leads'")
    })

    it('keeps settings transitions scoped to the detail pane instead of painting a fullscreen shell overlay', () => {
        const transitionViewportSource = fs.readFileSync(
            path.join(process.cwd(), 'src/components/common/DashboardRouteTransitionViewport.tsx'),
            'utf8'
        )
        const settingsLoadingSource = fs.readFileSync(SETTINGS_LOADING_PATH, 'utf8')

        expect(transitionViewportSource).toContain('shouldRenderGlobalDashboardPendingOverlay')
        expect(settingsLoadingSource).toContain('SettingsDetailLoadingSkeleton')
        expect(settingsLoadingSource).not.toContain('DashboardRouteSkeleton route="page"')
    })

    it('streams heavy settings pages behind detail-scoped suspense boundaries', () => {
        const organizationPageSource = fs.readFileSync(SETTINGS_ORGANIZATION_PAGE_PATH, 'utf8')
        const billingPageSource = fs.readFileSync(SETTINGS_BILLING_PAGE_PATH, 'utf8')
        const plansPageSource = fs.readFileSync(SETTINGS_PLANS_PAGE_PATH, 'utf8')

        expect(organizationPageSource).toContain('Suspense')
        expect(organizationPageSource).toContain('OrganizationSettingsPageContent')
        expect(organizationPageSource).toContain('OrganizationSettingsPageSkeleton')

        expect(billingPageSource).toContain('Suspense')
        expect(billingPageSource).toContain('BillingSettingsPageContent')
        expect(billingPageSource).toContain('BillingSettingsPageSkeleton')

        expect(plansPageSource).toContain('Suspense')
        expect(plansPageSource).toContain('PlansSettingsPageContent')
        expect(plansPageSource).toContain('PlansSettingsPageSkeleton')
    })

    it('lazy-loads low-frequency settings detail trees and checkout dialogs', () => {
        const organizationClientSource = fs.readFileSync(SETTINGS_ORGANIZATION_CLIENT_PATH, 'utf8')
        const planManagerSource = fs.readFileSync(SETTINGS_PLAN_MANAGER_PATH, 'utf8')
        const planCatalogSource = fs.readFileSync(SETTINGS_PLAN_CATALOG_PATH, 'utf8')
        const topupCardSource = fs.readFileSync(SETTINGS_TOPUP_CARD_PATH, 'utf8')

        expect(organizationClientSource).toContain("from 'next/dynamic'")
        expect(organizationClientSource).toContain("dynamic(() => import('@/components/settings/OfferingProfileSection')")
        expect(organizationClientSource).toContain("dynamic(() => import('@/components/settings/ServiceCatalogSection')")
        expect(organizationClientSource).toContain("dynamic(() => import('@/components/settings/RequiredIntakeFieldsSection')")

        expect(planManagerSource).toContain("from 'next/dynamic'")
        expect(planManagerSource).toContain("dynamic(() => import('./CheckoutLegalConsentModal')")

        expect(planCatalogSource).toContain("from 'next/dynamic'")
        expect(planCatalogSource).toContain("dynamic(() => import('./CheckoutLegalConsentModal')")

        expect(topupCardSource).toContain("from 'next/dynamic'")
        expect(topupCardSource).toContain("dynamic(() => import('./CheckoutLegalConsentModal')")
    })

    it('keeps dashboard layout on the slim org-context path during initial render', () => {
        const layoutSource = fs.readFileSync(DASHBOARD_LAYOUT_PATH, 'utf8')

        expect(layoutSource).not.toContain("resolveActiveOrganizationContext(undefined, { includeAccessibleOrganizations: true })")
    })

    it('lazy-loads heavy workspace route containers and removes inbox thread bootstrap from the server critical path', () => {
        const inboxPageSource = fs.readFileSync(INBOX_PAGE_PATH, 'utf8')
        const calendarPageSource = fs.readFileSync(CALENDAR_PAGE_PATH, 'utf8')
        const leadsPageSource = fs.readFileSync(LEADS_PAGE_PATH, 'utf8')
        const skillsPageSource = fs.readFileSync(SKILLS_PAGE_PATH, 'utf8')
        const knowledgePageSource = fs.readFileSync(KNOWLEDGE_PAGE_PATH, 'utf8')

        expect(inboxPageSource).toContain("from 'next/dynamic'")
        expect(inboxPageSource).toContain("import('@/components/inbox/InboxContainer')")
        expect(inboxPageSource).not.toContain('getConversationThreadPayload(')

        expect(calendarPageSource).toContain("from 'next/dynamic'")
        expect(calendarPageSource).toContain("import('@/components/calendar/CalendarClient')")

        expect(leadsPageSource).toContain("from 'next/dynamic'")
        expect(leadsPageSource).toContain("import('@/components/leads/LeadsClient')")

        expect(skillsPageSource).toContain("from 'next/dynamic'")
        expect(skillsPageSource).toContain("import('@/components/skills/SkillsContainer')")

        expect(knowledgePageSource).toContain("from 'next/dynamic'")
        expect(knowledgePageSource).toContain("import('./components/KnowledgeContainer')")
    })
})
