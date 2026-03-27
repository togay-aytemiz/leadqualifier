import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SETTINGS_SHELL_PATH = path.resolve(
  process.cwd(),
  'src/components/settings/SettingsResponsiveShell.tsx'
)

describe('SettingsResponsiveShell source', () => {
  it('includes calendar under preferences and apps under integrations', () => {
    const source = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

    expect(source).toContain("id: 'calendar'")
    expect(source).toContain("href: getLocalizedHref(locale, '/settings/calendar')")
    expect(source).toContain("id: 'apps'")
    expect(source).toContain("href: getLocalizedHref(locale, '/settings/apps')")
  })

  it('hydrates pending suggestion count on the client', () => {
    const source = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

    expect(source).toContain('createClient()')
    expect(source).toContain("'pending-suggestions-updated'")
    expect(source).toContain(".from('offering_profile_suggestions')")
  })

  it('guards pending count against stale organization fetches', () => {
    const source = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

    expect(source).toContain('pendingCountRequestIdRef')
    expect(source).toContain('pendingCountRequestIdRef.current !== requestId')
    expect(source).toContain('pendingCountRequestIdRef.current += 1')
  })

  it('derives the pending count from the active organization instead of resetting state in an effect', () => {
    const source = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

    expect(source).toContain('const [loadedPendingCount, setLoadedPendingCount] = useState<')
    expect(source).toContain('loadedPendingCount?.organizationId === activeOrganizationId')
    expect(source).not.toContain('setPendingCount(initialPendingCount)')
  })

  it('keeps prefetch routes stable across pending-count updates', () => {
    const source = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

    expect(source).toContain('const prefetchRoutes = useMemo(() => {')
    expect(source).toContain('}, [billingOnlyMode, locale])')
    expect(source).toContain('}, [prefetchRoutes, router])')
  })

  it('warms dashboard routes on navigation intent before click transitions', () => {
    const source = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

    expect(source).toContain('primeDashboardRoute')
    expect(source).toContain('dispatchDashboardRouteTransitionStart')
    expect(source).toContain('onNavigateIntent={() => warmDashboardRoute(item.href)}')
  })

  it('resolves active settings state from the optimistic dashboard route helper', () => {
    const source = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

    expect(source).toContain('useDashboardRouteState(pathname)')
    expect(source).toContain('getSettingsNavItemFromPath(activePath)')
  })
})
