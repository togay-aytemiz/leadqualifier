import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN_SIDEBAR_PATH = path.join(process.cwd(), 'src/design/MainSidebar.tsx')
const MOBILE_BOTTOM_NAV_PATH = path.join(process.cwd(), 'src/design/MobileBottomNav.tsx')
const SIDEBAR_PATH = path.join(process.cwd(), 'src/design/Sidebar.tsx')
const SETTINGS_SHELL_PATH = path.join(process.cwd(), 'src/components/settings/SettingsResponsiveShell.tsx')

describe('navigation performance source guards', () => {
    it('keeps primary nav routes warm while preserving configurable shell prefetch control', () => {
        const sidebarSource = fs.readFileSync(SIDEBAR_PATH, 'utf8')
        const mainSidebarSource = fs.readFileSync(MAIN_SIDEBAR_PATH, 'utf8')
        const mobileBottomNavSource = fs.readFileSync(MOBILE_BOTTOM_NAV_PATH, 'utf8')
        const settingsShellSource = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

        expect(sidebarSource).toContain('prefetch = false')
        expect(sidebarSource).toContain('<Link href={href} prefetch={prefetch}')
        expect(settingsShellSource.match(/prefetch/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
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
})
