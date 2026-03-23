import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN_SIDEBAR_PATH = path.join(process.cwd(), 'src/design/MainSidebar.tsx')
const MOBILE_BOTTOM_NAV_PATH = path.join(process.cwd(), 'src/design/MobileBottomNav.tsx')
const SIDEBAR_PATH = path.join(process.cwd(), 'src/design/Sidebar.tsx')
const SETTINGS_SHELL_PATH = path.join(process.cwd(), 'src/components/settings/SettingsResponsiveShell.tsx')
const TAB_TITLE_SYNC_PATH = path.join(process.cwd(), 'src/components/common/TabTitleSync.tsx')

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
        expect(mainSidebarSource).toContain("href={itemHref}\n                                            title={collapsed ? undefined : item.label}")
        expect(mobileBottomNavSource).toContain("href={item.href}\n                                className={cn(")
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
        expect(mobileBottomNavSource).toContain('if (!activeOrganizationId || isDesktopViewport) {')
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
})
