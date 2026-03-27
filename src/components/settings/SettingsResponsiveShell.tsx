'use client'

import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Sidebar, SidebarGroup, SidebarItem } from '@/design'
import { shouldEnableManualRoutePrefetch } from '@/design/manual-prefetch'
import {
  dispatchDashboardRouteTransitionStart,
  primeDashboardRoute,
  shouldStartDashboardRouteTransition,
} from '@/design/dashboard-route-transition'
import { useDashboardRouteState } from '@/design/dashboard-route-state'
import { buildOrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import { resolveWorkspaceAccessState } from '@/lib/billing/workspace-access'
import {
  HiOutlineBanknotes,
  HiOutlineBriefcase,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCreditCard,
  HiOutlinePuzzlePiece,
  HiOutlineSparkles,
  HiOutlineUserCircle,
} from 'react-icons/hi2'
import {
  getSettingsNavItemFromPath,
  getSettingsMobileDetailPaneClasses,
  getSettingsMobileListPaneClasses,
  SETTINGS_MOBILE_BACK_EVENT,
  type SettingsNavItemId,
} from '@/components/settings/mobilePaneState'
import { resolveBillingLockedNavItem } from '@/lib/billing/navigation-lock'
import {
  buildSettingsRouteCacheKey,
  getSettingsRouteCacheEntry,
  setSettingsRouteCacheEntry,
} from '@/lib/settings/route-cache'
import { createClient } from '@/lib/supabase/client'
import type { OrganizationBillingAccount } from '@/types/database'

interface SettingsResponsiveShellProps {
  activeOrganizationId?: string | null
  initialPendingCount?: number
  initialBillingOnlyMode?: boolean
  bypassBillingOnlyMode?: boolean
  children?: ReactNode
}

type SettingsGroup = 'preferences' | 'integrations' | 'billing'

interface SettingsNavItem {
  id: SettingsNavItemId
  group: SettingsGroup
  label: string
  href?: string
  active?: boolean
  indicator?: boolean
  locked?: boolean
  icon: ReactNode
}

function getLocalizedHref(locale: string, href: string): string {
  if (locale === 'tr') return href
  return `/${locale}${href}`
}

export function SettingsResponsiveShell({
  activeOrganizationId = null,
  initialPendingCount = 0,
  initialBillingOnlyMode = false,
  bypassBillingOnlyMode = false,
  children,
}: SettingsResponsiveShellProps) {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { activePath, currentPath, pendingPath } = useDashboardRouteState(pathname)
  const activeItem = getSettingsNavItemFromPath(activePath)
  const tSidebar = useTranslations('Sidebar')
  const supabase = useMemo(() => createClient(), [])
  const localePrefix = locale === 'tr' ? '' : `/${locale}`
  const hasDetail = Boolean(activeItem && children)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isClosingRef = useRef(false)
  const pendingCountRequestIdRef = useRef(0)
  const billingModeRequestIdRef = useRef(0)
  const settingsRootHref = getLocalizedHref(locale, '/settings')
  const [loadedPendingCount, setLoadedPendingCount] = useState<{
    organizationId: string
    count: number
  } | null>(null)
  const [loadedBillingOnlyMode, setLoadedBillingOnlyMode] = useState<{
    organizationId: string
    value: boolean
  } | null>(null)
  const pendingCount = !activeOrganizationId
    ? 0
    : loadedPendingCount?.organizationId === activeOrganizationId
      ? loadedPendingCount.count
      : initialPendingCount
  const billingOnlyMode = !activeOrganizationId
    ? false
    : bypassBillingOnlyMode
      ? false
    : loadedBillingOnlyMode?.organizationId === activeOrganizationId
      ? loadedBillingOnlyMode.value
      : initialBillingOnlyMode

  const refreshPendingCount = useCallback(async () => {
    const requestId = pendingCountRequestIdRef.current + 1
    pendingCountRequestIdRef.current = requestId

    if (!activeOrganizationId) {
      return
    }

    const { count, error } = await supabase
      .from('offering_profile_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', activeOrganizationId)
      .is('archived_at', null)
      .or('status.eq.pending,status.is.null')

    if (error) {
      if (pendingCountRequestIdRef.current !== requestId) {
        return
      }
      console.error('Failed to load settings pending suggestion count', error)
      return
    }

    if (pendingCountRequestIdRef.current !== requestId) {
      return
    }

    setLoadedPendingCount({
      organizationId: activeOrganizationId,
      count: count ?? 0,
    })
  }, [activeOrganizationId, supabase])

  const refreshBillingOnlyMode = useCallback(async () => {
    const requestId = billingModeRequestIdRef.current + 1
    billingModeRequestIdRef.current = requestId

    if (!activeOrganizationId || bypassBillingOnlyMode) {
      return
    }

    const { data, error } = await supabase
      .from('organization_billing_accounts')
      .select('*')
      .eq('organization_id', activeOrganizationId)
      .maybeSingle()

    if (error) {
      if (billingModeRequestIdRef.current !== requestId) {
        return
      }
      console.error('Failed to load settings workspace access state', error)
      return
    }

    if (billingModeRequestIdRef.current !== requestId) {
      return
    }

    const snapshot = data
      ? buildOrganizationBillingSnapshot(data as OrganizationBillingAccount)
      : null

    setLoadedBillingOnlyMode({
      organizationId: activeOrganizationId,
      value: resolveWorkspaceAccessState(snapshot).isLocked,
    })
  }, [activeOrganizationId, bypassBillingOnlyMode, supabase])

  const navItems = useMemo<SettingsNavItem[]>(() => {
    const fullNavItems: SettingsNavItem[] = [
      {
        id: 'profile',
        group: 'preferences',
        label: tSidebar('profile'),
        href: getLocalizedHref(locale, '/settings/profile'),
        icon: <HiOutlineUserCircle size={18} />,
        active: activeItem === 'profile',
      },
      {
        id: 'organization',
        group: 'preferences',
        label: tSidebar('organization'),
        href: getLocalizedHref(locale, '/settings/organization'),
        icon: <HiOutlineBriefcase size={18} />,
        active: activeItem === 'organization',
        indicator: pendingCount > 0,
      },
      {
        id: 'ai',
        group: 'preferences',
        label: tSidebar('ai'),
        href: getLocalizedHref(locale, '/settings/ai'),
        icon: <HiOutlineSparkles size={18} />,
        active: activeItem === 'ai',
      },
      {
        id: 'calendar',
        group: 'preferences',
        label: tSidebar('calendar'),
        href: getLocalizedHref(locale, '/settings/calendar'),
        icon: <HiOutlineCalendarDays size={18} />,
        active: activeItem === 'calendar',
      },
      {
        id: 'channels',
        group: 'integrations',
        label: tSidebar('channels'),
        href: getLocalizedHref(locale, '/settings/channels'),
        icon: <HiOutlineChatBubbleLeftRight size={18} />,
        active: activeItem === 'channels',
      },
      {
        id: 'apps',
        group: 'integrations',
        label: tSidebar('apps'),
        href: getLocalizedHref(locale, '/settings/apps'),
        icon: <HiOutlinePuzzlePiece size={18} />,
        active: activeItem === 'apps',
      },
      {
        id: 'plans',
        group: 'billing',
        label: tSidebar('plans'),
        href: getLocalizedHref(locale, '/settings/plans'),
        icon: <HiOutlineCreditCard size={18} />,
        active: activeItem === 'plans',
      },
      {
        id: 'billing',
        group: 'billing',
        label: tSidebar('receipts'),
        href: getLocalizedHref(locale, '/settings/billing'),
        icon: <HiOutlineBanknotes size={18} />,
        active: activeItem === 'billing',
      },
    ]

    return fullNavItems.map((item) => {
      const navState = resolveBillingLockedNavItem(
        {
          id: item.id,
          href: item.href,
        },
        billingOnlyMode
      )

      return {
        ...item,
        href: navState.href,
        locked: navState.isLocked,
      }
    })
  }, [activeItem, billingOnlyMode, locale, pendingCount, tSidebar])
  const prefetchRoutes = useMemo(() => {
    const routeItems: Array<{ id: SettingsNavItemId; href: string }> = [
      { id: 'profile', href: getLocalizedHref(locale, '/settings/profile') },
      { id: 'organization', href: getLocalizedHref(locale, '/settings/organization') },
      { id: 'ai', href: getLocalizedHref(locale, '/settings/ai') },
      { id: 'calendar', href: getLocalizedHref(locale, '/settings/calendar') },
      { id: 'channels', href: getLocalizedHref(locale, '/settings/channels') },
      { id: 'apps', href: getLocalizedHref(locale, '/settings/apps') },
      { id: 'plans', href: getLocalizedHref(locale, '/settings/plans') },
      { id: 'billing', href: getLocalizedHref(locale, '/settings/billing') },
    ]

    return routeItems.flatMap((item) => {
      const navState = resolveBillingLockedNavItem(item, billingOnlyMode)
      return navState.isLocked || !navState.href ? [] : [navState.href]
    })
  }, [billingOnlyMode, locale])
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false)
  const currentRouteCacheKey = useMemo(() => {
    if (!activeOrganizationId || !activeItem || !children) return null
    return buildSettingsRouteCacheKey({
      organizationId: activeOrganizationId,
      locale,
      routePath: currentPath,
    })
  }, [activeItem, activeOrganizationId, children, currentPath, locale])
  const pendingRouteCacheKey = useMemo(() => {
    if (!activeOrganizationId || !pendingPath || !getSettingsNavItemFromPath(pendingPath)) return null
    return buildSettingsRouteCacheKey({
      organizationId: activeOrganizationId,
      locale,
      routePath: pendingPath,
    })
  }, [activeOrganizationId, locale, pendingPath])
  const pendingRouteCacheEntry = useMemo(
    () => (pendingRouteCacheKey ? getSettingsRouteCacheEntry(pendingRouteCacheKey) : null),
    [pendingRouteCacheKey]
  )
  const isShowingPendingRouteCache = Boolean(
    pendingPath && pendingRouteCacheEntry && pendingPath !== currentPath
  )
  const renderedDetailChildren = isShowingPendingRouteCache
    ? pendingRouteCacheEntry?.content
    : children

  useEffect(() => {
    if (!currentRouteCacheKey || !children) return
    setSettingsRouteCacheEntry(currentRouteCacheKey, children)
  }, [children, currentRouteCacheKey])

  useEffect(() => {
    if (!hasDetail) {
      const frame = window.requestAnimationFrame(() => {
        setIsMobileDetailOpen(false)
      })
      return () => window.cancelAnimationFrame(frame)
    }

    const frame = window.requestAnimationFrame(() => {
      setIsMobileDetailOpen(true)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [hasDetail, pathname])

  useEffect(() => {
    return () => {
      pendingCountRequestIdRef.current += 1
      billingModeRequestIdRef.current += 1
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    pendingCountRequestIdRef.current += 1
    billingModeRequestIdRef.current += 1
  }, [activeOrganizationId])

  useEffect(() => {
    if (!activeOrganizationId) return
    const frame = window.requestAnimationFrame(() => {
      void refreshPendingCount()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeOrganizationId, refreshPendingCount])

  useEffect(() => {
    if (!activeOrganizationId || bypassBillingOnlyMode) return
    const frame = window.requestAnimationFrame(() => {
      void refreshBillingOnlyMode()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeOrganizationId, bypassBillingOnlyMode, refreshBillingOnlyMode])

  const navigateBackToSettings = useCallback(() => {
    if (!hasDetail || isClosingRef.current) return

    isClosingRef.current = true
    setIsMobileDetailOpen(false)

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
    }

    closeTimeoutRef.current = setTimeout(() => {
      router.replace(settingsRootHref)
      closeTimeoutRef.current = null
      isClosingRef.current = false
    }, 220)
  }, [hasDetail, router, settingsRootHref])

  useEffect(() => {
    const handleBack = () => {
      navigateBackToSettings()
    }

    window.addEventListener(SETTINGS_MOBILE_BACK_EVENT, handleBack)
    return () => window.removeEventListener(SETTINGS_MOBILE_BACK_EVENT, handleBack)
  }, [navigateBackToSettings])

  useEffect(() => {
    const handler = () => {
      void refreshPendingCount()
    }

    window.addEventListener('pending-suggestions-updated', handler)
    return () => window.removeEventListener('pending-suggestions-updated', handler)
  }, [refreshPendingCount])

  useEffect(() => {
    if (!shouldEnableManualRoutePrefetch('app-shell')) return

    const prefetchVisibleRoutes = () => {
      prefetchRoutes.forEach((href) => {
        router.prefetch(href)
      })
    }

    const timeoutId = setTimeout(prefetchVisibleRoutes, 250)
    return () => clearTimeout(timeoutId)
  }, [prefetchRoutes, router])

  const warmDashboardRoute = useCallback(
    (href: string | undefined) => {
      if (!href) return
      primeDashboardRoute(router, href, localePrefix)
    },
    [localePrefix, router]
  )

  const handleDashboardNavClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>, href: string | undefined) => {
      if (!href || !shouldStartDashboardRouteTransition(event)) return
      warmDashboardRoute(href)
      dispatchDashboardRouteTransitionStart(href)
    },
    [warmDashboardRoute]
  )

  const mobileListPaneClasses = getSettingsMobileListPaneClasses(isMobileDetailOpen)
  const mobileDetailPaneClasses = getSettingsMobileDetailPaneClasses(isMobileDetailOpen)

  const renderNavGroups = () => {
    const preferences = navItems.filter((item) => item.group === 'preferences')
    const integrations = navItems.filter((item) => item.group === 'integrations')
    const billing = navItems.filter((item) => item.group === 'billing')

    return (
      <>
        {preferences.length > 0 && (
          <SidebarGroup title={tSidebar('preferences')}>
            {preferences.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                href={item.href}
                active={item.active}
                indicator={item.indicator}
                disabled={item.locked}
                disabledLabel={tSidebar('lockedLabel')}
                onNavigateIntent={() => warmDashboardRoute(item.href)}
                onNavigateClick={(event) => handleDashboardNavClick(event, item.href)}
              />
            ))}
          </SidebarGroup>
        )}

        {integrations.length > 0 && (
          <SidebarGroup title={tSidebar('integrations')}>
            {integrations.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                href={item.href}
                active={item.active}
                disabled={item.locked}
                disabledLabel={tSidebar('lockedLabel')}
                onNavigateIntent={() => warmDashboardRoute(item.href)}
                onNavigateClick={(event) => handleDashboardNavClick(event, item.href)}
              />
            ))}
          </SidebarGroup>
        )}

        {billing.length > 0 && (
          <SidebarGroup title={tSidebar('billing')}>
            {billing.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                href={item.href}
                active={item.active}
                disabled={item.locked}
                disabledLabel={tSidebar('lockedLabel')}
                onNavigateIntent={() => warmDashboardRoute(item.href)}
                onNavigateClick={(event) => handleDashboardNavClick(event, item.href)}
              />
            ))}
          </SidebarGroup>
        )}
      </>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="hidden h-full lg:flex">
        <Sidebar title={tSidebar('settings')}>{renderNavGroups()}</Sidebar>
      </div>

      <div
        className={cn(
          'absolute inset-0 z-20 flex h-full w-full flex-col border-r border-gray-200 bg-gray-50/50 transition-transform duration-300 ease-out lg:hidden',
          mobileListPaneClasses
        )}
      >
        <div className="h-14 flex items-center justify-between border-b border-gray-200 bg-gray-50/50 px-6 shrink-0">
          <h2 className="text-xl font-bold text-gray-900">{tSidebar('settings')}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-6">{renderNavGroups()}</div>
      </div>

      <div
        className={cn(
          'absolute inset-0 z-30 min-w-0 transition-transform duration-300 ease-out lg:static lg:z-auto lg:flex lg:min-w-0 lg:flex-1 lg:translate-x-0 lg:pointer-events-auto lg:transition-none',
          mobileDetailPaneClasses
        )}
      >
        <div
          aria-busy={isShowingPendingRouteCache || undefined}
          className={cn(
            'flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white',
            isShowingPendingRouteCache ? 'pointer-events-none' : ''
          )}
        >
          {renderedDetailChildren}
        </div>
      </div>
    </div>
  )
}
