'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  HiMiniCalendarDays,
  HiMiniChatBubbleBottomCenterText,
  HiMiniUser,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineSparkles,
  HiOutlineSquare3Stack3D,
  HiOutlineUser,
} from 'react-icons/hi2'
import { AlertCircle, LogOut, Lock, MoreHorizontal, Puzzle, Rocket, Settings } from 'lucide-react'

import { cn } from '@/lib/utils'
import { resolveMobileNavActiveItem, type MobileNavItemId } from '@/design/mobile-navigation'
import { shouldEnableManualRoutePrefetch } from '@/design/manual-prefetch'
import {
  dispatchDashboardRouteTransitionStart,
  primeDashboardRoute,
  resolveDashboardPrefetchTargets,
  shouldStartDashboardRouteTransition,
} from '@/design/dashboard-route-transition'
import { useDashboardRouteState } from '@/design/dashboard-route-state'
import { createClient } from '@/lib/supabase/client'
import type { OrganizationBillingAccount } from '@/types/database'
import {
  buildOrganizationBillingSnapshot,
  type OrganizationBillingSnapshot,
} from '@/lib/billing/snapshot'
import { buildBillingRefreshSignal } from '@/lib/billing/refresh-signal'
import { BILLING_UPDATED_EVENT } from '@/lib/billing/events'
import {
  calculateSidebarBillingProgressSegments,
  isLowCreditWarningVisible,
} from '@/lib/billing/sidebar-progress'
import { formatSidebarBillingCredits, formatSidebarBillingDate } from '@/lib/billing/sidebar-format'
import { resolveWorkspaceAccessState } from '@/lib/billing/workspace-access'
import { resolveBillingLockedNavItem } from '@/lib/billing/navigation-lock'
import type { OrganizationOnboardingShellState } from '@/lib/onboarding/state'
import {
  listenForOnboardingStateUpdates,
  shouldApplyOnboardingStateUpdate,
} from '@/lib/onboarding/events'

interface NavItem {
  id: Exclude<MobileNavItemId, 'other'>
  href: string
  label: string
  icon: ComponentType<{ size?: number }>
  activeIcon: ComponentType<{ size?: number }>
  locked?: boolean
}

interface MobileBottomNavProps {
  activeOrganizationId?: string | null
  onboardingState?: OrganizationOnboardingShellState | null
  initialBillingSnapshot?: OrganizationBillingSnapshot | null
}

export function MobileBottomNav({
  activeOrganizationId = null,
  onboardingState = null,
  initialBillingSnapshot = null,
}: MobileBottomNavProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const locale = useLocale()
  const tNav = useTranslations('nav')
  const tSidebar = useTranslations('mainSidebar')
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean | null>(null)
  const [otherMenuPath, setOtherMenuPath] = useState<string | null>(null)
  const [loadedBillingSnapshot, setLoadedBillingSnapshot] = useState<{
    organizationId: string
    snapshot: OrganizationBillingSnapshot | null
  } | null>(
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          snapshot: initialBillingSnapshot,
        }
      : null
  )
  const [syncedOnboardingState, setSyncedOnboardingState] =
    useState<OrganizationOnboardingShellState | null>(onboardingState)
  const effectiveOnboardingState = syncedOnboardingState ?? onboardingState

  const { activePath } = useDashboardRouteState(pathname)
  const activeItem = resolveMobileNavActiveItem(activePath)
  const isOtherOpen = otherMenuPath === pathname
  const localePrefixMatch = pathname.match(/^\/([a-z]{2})(\/|$)/)
  const localePrefix =
    localePrefixMatch && localePrefixMatch[1] !== 'tr' ? `/${localePrefixMatch[1]}` : ''
  const supabase = useMemo(() => createClient(), [])
  const billingRefreshSignal = useMemo(
    () => buildBillingRefreshSignal(searchParams, pathname),
    [pathname, searchParams]
  )
  const billingSnapshot =
    activeOrganizationId &&
    isDesktopViewport === false &&
    loadedBillingSnapshot?.organizationId === activeOrganizationId
      ? loadedBillingSnapshot.snapshot
      : null

  const workspaceAccess = useMemo(
    () => resolveWorkspaceAccessState(billingSnapshot),
    [billingSnapshot]
  )
  const shouldRestrictToBilling = workspaceAccess.isLocked
  const settingsMenuNavState = resolveBillingLockedNavItem(
    {
      id: 'settings',
      href: '/settings',
    },
    shouldRestrictToBilling
  )
  const simulatorMenuNavState = resolveBillingLockedNavItem(
    {
      id: 'simulator',
      href: '/simulator',
    },
    shouldRestrictToBilling
  )
  const skillsMenuNavState = resolveBillingLockedNavItem(
    {
      id: 'skills',
      href: '/skills',
    },
    shouldRestrictToBilling
  )
  const knowledgeMenuNavState = resolveBillingLockedNavItem(
    {
      id: 'knowledge',
      href: '/knowledge',
    },
    shouldRestrictToBilling
  )
  const navItems = useMemo<NavItem[]>(() => {
    const defaultItems: NavItem[] = [
      {
        id: 'inbox',
        href: '/inbox',
        label: tNav('inbox'),
        icon: HiOutlineChatBubbleBottomCenterText,
        activeIcon: HiMiniChatBubbleBottomCenterText,
      },
      {
        id: 'calendar',
        href: '/calendar',
        label: tNav('calendar'),
        icon: HiOutlineCalendarDays,
        activeIcon: HiMiniCalendarDays,
      },
      {
        id: 'contacts',
        href: '/leads',
        label: tNav('leads'),
        icon: HiOutlineUser,
        activeIcon: HiMiniUser,
      },
    ]

    return defaultItems.map((item) => {
      const navState = resolveBillingLockedNavItem(
        {
          id: item.id,
          href: item.href,
        },
        shouldRestrictToBilling
      )

      return {
        ...item,
        href: navState.href ?? item.href,
        locked: navState.isLocked,
      }
    })
  }, [shouldRestrictToBilling, tNav])
  const navGridColumnsClass = 'grid-cols-4'

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const syncViewport = () => {
      setIsDesktopViewport(mediaQuery.matches)
    }

    syncViewport()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncViewport)
      return () => mediaQuery.removeEventListener('change', syncViewport)
    }

    mediaQuery.addListener(syncViewport)
    return () => mediaQuery.removeListener(syncViewport)
  }, [])

  useEffect(() => {
    setSyncedOnboardingState(onboardingState)
  }, [onboardingState])

  useEffect(() => {
    if (isDesktopViewport !== false) return

    return listenForOnboardingStateUpdates((detail) => {
      if (!shouldApplyOnboardingStateUpdate(activeOrganizationId, detail)) return
      setSyncedOnboardingState(detail.onboardingState ?? null)
    })
  }, [activeOrganizationId, isDesktopViewport])

  useEffect(() => {
    if (!shouldEnableManualRoutePrefetch('app-shell')) return
    if (isDesktopViewport !== false) return

    const hotRoutes = [
      '/inbox',
      '/calendar',
      '/leads',
      '/skills',
      '/knowledge',
      '/onboarding',
      '/simulator',
      '/settings',
      '/settings/plans',
      '/settings/billing',
    ]

    const prefetchRoutes = () => {
      resolveDashboardPrefetchTargets(hotRoutes, pathname).forEach((href) => (
        router.prefetch(`${localePrefix}${href}`)
      ))
    }

    const timeoutId = setTimeout(prefetchRoutes, 250)
    return () => clearTimeout(timeoutId)
  }, [isDesktopViewport, localePrefix, pathname, router])

  const warmDashboardHotRoute = useCallback(
    (href: string) => {
      primeDashboardRoute(router, href, localePrefix)
    },
    [localePrefix, router]
  )

  const handleDashboardNavClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>, href: string) => {
      if (!shouldStartDashboardRouteTransition(event)) return
      dispatchDashboardRouteTransitionStart(href)
    },
    []
  )

  const refreshBillingSnapshot = useCallback(async () => {
    if (!activeOrganizationId || isDesktopViewport !== false) {
      return
    }

    const { data, error } = await supabase
      .from('organization_billing_accounts')
      .select('*')
      .eq('organization_id', activeOrganizationId)
      .maybeSingle()

    if (error || !data) {
      if (error) {
        console.error('Failed to load mobile billing status', error)
      }
      setLoadedBillingSnapshot({
        organizationId: activeOrganizationId,
        snapshot: null,
      })
      return
    }

    setLoadedBillingSnapshot({
      organizationId: activeOrganizationId,
      snapshot: buildOrganizationBillingSnapshot(data as OrganizationBillingAccount),
    })
  }, [activeOrganizationId, isDesktopViewport, supabase])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!activeOrganizationId) {
        setLoadedBillingSnapshot(null)
        return
      }

      setLoadedBillingSnapshot({
        organizationId: activeOrganizationId,
        snapshot: initialBillingSnapshot,
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeOrganizationId, initialBillingSnapshot])

  useEffect(() => {
    if (!activeOrganizationId || isDesktopViewport !== false) return
    if (loadedBillingSnapshot?.organizationId === activeOrganizationId && !billingRefreshSignal) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      void refreshBillingSnapshot()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [
    activeOrganizationId,
    billingRefreshSignal,
    isDesktopViewport,
    loadedBillingSnapshot?.organizationId,
    refreshBillingSnapshot,
  ])

  useEffect(() => {
    if (!activeOrganizationId || isDesktopViewport !== false) return
    const handler = () => {
      void refreshBillingSnapshot()
    }
    window.addEventListener(BILLING_UPDATED_EVENT, handler)
    return () => window.removeEventListener(BILLING_UPDATED_EVENT, handler)
  }, [activeOrganizationId, isDesktopViewport, refreshBillingSnapshot])

  const billingMembershipLabel = useMemo(() => {
    if (!billingSnapshot) return tSidebar('billingUnavailable')

    switch (billingSnapshot.membershipState) {
      case 'trial_active':
        return tSidebar('billingTrialActive')
      case 'trial_exhausted':
        return tSidebar('billingTrialExhausted')
      case 'premium_active':
        return tSidebar('billingPremiumActive')
      case 'past_due':
        return tSidebar('billingPastDue')
      case 'canceled':
        return tSidebar('billingCanceled')
      case 'admin_locked':
        return tSidebar('billingAdminLocked')
      default:
        return billingSnapshot.membershipState
    }
  }, [billingSnapshot, tSidebar])
  const billingDisplayCredits = useMemo(() => {
    if (!billingSnapshot) return 0

    if (
      billingSnapshot.membershipState === 'trial_active' ||
      billingSnapshot.membershipState === 'trial_exhausted'
    ) {
      return billingSnapshot.trial.credits.remaining
    }

    if (billingSnapshot.membershipState === 'premium_active') {
      return billingSnapshot.package.credits.remaining + billingSnapshot.topupBalance
    }

    return billingSnapshot.totalRemainingCredits
  }, [billingSnapshot])
  const billingProgressSegments = useMemo(() => {
    if (!billingSnapshot) {
      return {
        packagePercent: 0,
        topupPercent: 0,
      }
    }

    return calculateSidebarBillingProgressSegments({
      membershipState: billingSnapshot.membershipState,
      trialRemainingCredits: billingSnapshot.trial.credits.remaining,
      trialCreditLimit: billingSnapshot.trial.credits.limit,
      packageRemainingCredits: billingSnapshot.package.credits.remaining,
      packageCreditLimit: billingSnapshot.package.credits.limit,
      topupBalance: billingSnapshot.topupBalance,
    })
  }, [billingSnapshot])
  const showLowCreditWarning = useMemo(() => {
    if (!billingSnapshot) return false

    return isLowCreditWarningVisible({
      membershipState: billingSnapshot.membershipState,
      trialRemainingCredits: billingSnapshot.trial.credits.remaining,
      trialCreditLimit: billingSnapshot.trial.credits.limit,
      packageRemainingCredits: billingSnapshot.package.credits.remaining,
      packageCreditLimit: billingSnapshot.package.credits.limit,
      topupBalance: billingSnapshot.topupBalance,
    })
  }, [billingSnapshot])
  const billingDetailPrimary = useMemo(() => {
    if (!billingSnapshot) return tSidebar('billingUnavailableDescription')

    if (billingSnapshot.membershipState === 'trial_active') {
      return tSidebar('billingTrialSubline', {
        days: String(billingSnapshot.trial.remainingDays),
      })
    }

    if (billingSnapshot.membershipState === 'trial_exhausted') {
      return tSidebar('billingUpgradePromptSubline')
    }

    if (billingSnapshot.membershipState === 'premium_active') {
      return tSidebar('billingPackageCreditsSubline', {
        credits: formatSidebarBillingCredits(locale, billingSnapshot.package.credits.remaining),
      })
    }

    if (billingSnapshot.membershipState === 'past_due') {
      return tSidebar('billingPaymentRequiredSubline')
    }

    if (billingSnapshot.membershipState === 'canceled') {
      return tSidebar('billingUpgradePromptSubline')
    }

    if (billingSnapshot.membershipState === 'admin_locked') {
      return tSidebar('billingContactSupportSubline')
    }

    return tSidebar('billingUnavailableDescription')
  }, [billingSnapshot, locale, tSidebar])
  const billingDetailSecondary = useMemo(() => {
    if (!billingSnapshot) return null

    if (billingSnapshot.membershipState === 'trial_active') {
      return tSidebar('billingTrialCreditsSubline', {
        credits: formatSidebarBillingCredits(locale, billingSnapshot.trial.credits.remaining),
      })
    }

    if (billingSnapshot.membershipState !== 'premium_active') {
      return null
    }

    if (billingSnapshot.topupBalance > 0) {
      return tSidebar('billingTopupSubline', {
        credits: formatSidebarBillingCredits(locale, billingSnapshot.topupBalance),
      })
    }

    if (!billingSnapshot.package.periodEnd) {
      return tSidebar('billingPackageSubline')
    }

    const resetDate = formatSidebarBillingDate(locale, billingSnapshot.package.periodEnd)
    if (resetDate) {
      return tSidebar('billingPackageSublineWithDate', { date: resetDate })
    }

    return tSidebar('billingPackageSubline')
  }, [billingSnapshot, locale, tSidebar])

  return (
    <>
      {isOtherOpen && (
        <>
          <button
            type="button"
            aria-label={tNav('closeOtherMenu')}
            onClick={() => setOtherMenuPath(null)}
            className="fixed inset-0 z-40 bg-black/25 lg:hidden"
          />
          <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl lg:hidden">
            {billingSnapshot && (
              <Link
                href="/settings/plans"
                prefetch={false}
                onMouseEnter={() => warmDashboardHotRoute('/settings/plans')}
                onFocus={() => warmDashboardHotRoute('/settings/plans')}
                onClick={(event) => {
                  handleDashboardNavClick(event, '/settings/plans')
                  setOtherMenuPath(null)
                }}
                className="mb-1 block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tSidebar('billingStatusLabel')}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {formatSidebarBillingCredits(locale, billingDisplayCredits)}
                  <span className="ml-1 text-xs font-medium text-slate-500">
                    {tSidebar('billingCreditsUnit')}
                  </span>
                </p>
                <div className="mt-2 h-1.5 flex overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-1.5 bg-[#242A40]"
                    style={{ width: `${Math.min(100, billingProgressSegments.packagePercent)}%` }}
                  />
                  {billingProgressSegments.topupPercent > 0 && (
                    <div
                      className="h-1.5 bg-purple-600"
                      style={{ width: `${Math.min(100, billingProgressSegments.topupPercent)}%` }}
                    />
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">{billingMembershipLabel}</p>
                <p className="mt-0.5 text-xs text-slate-500">{billingDetailPrimary}</p>
                {billingDetailSecondary && (
                  <p className="mt-0.5 text-xs text-slate-500">{billingDetailSecondary}</p>
                )}
                {showLowCreditWarning && (
                  <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    <AlertCircle size={10} />
                    {tSidebar('billingLowCreditWarning')}
                  </p>
                )}
              </Link>
            )}
            <div className="border-b border-slate-200 pb-2">
              <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {tNav('ai')}
              </p>
              {skillsMenuNavState.isLocked ? (
                <button
                  type="button"
                  disabled
                  aria-label={`${tNav('skills')} (${tSidebar('lockedLabel')})`}
                  className="mb-1 flex w-full cursor-not-allowed items-center gap-3 rounded-xl bg-slate-100/80 px-3 py-2.5 text-left text-sm font-medium text-slate-400"
                >
                  <HiOutlineSparkles size={16} />
                  <span>{tNav('skills')}</span>
                  <span className="ml-auto inline-flex items-center rounded-full border border-slate-200 bg-white p-1 text-slate-400">
                    <Lock size={10} />
                  </span>
                </button>
              ) : (
                <Link
                  href={skillsMenuNavState.href ?? '/skills'}
                  prefetch={false}
                  onMouseEnter={() => warmDashboardHotRoute(skillsMenuNavState.href ?? '/skills')}
                  onFocus={() => warmDashboardHotRoute(skillsMenuNavState.href ?? '/skills')}
                  onClick={(event) => {
                    handleDashboardNavClick(event, skillsMenuNavState.href ?? '/skills')
                    setOtherMenuPath(null)
                  }}
                  className={cn(
                    'mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                    pathname?.includes('/skills')
                      ? 'bg-[#242A40]/8 text-[#242A40]'
                      : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  <HiOutlineSparkles size={16} />
                  {tNav('skills')}
                </Link>
              )}

              {knowledgeMenuNavState.isLocked ? (
                <button
                  type="button"
                  disabled
                  aria-label={`${tNav('knowledgeBase')} (${tSidebar('lockedLabel')})`}
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl bg-slate-100/80 px-3 py-2.5 text-left text-sm font-medium text-slate-400"
                >
                  <HiOutlineSquare3Stack3D size={16} />
                  <span>{tNav('knowledgeBase')}</span>
                  <span className="ml-auto inline-flex items-center rounded-full border border-slate-200 bg-white p-1 text-slate-400">
                    <Lock size={10} />
                  </span>
                </button>
              ) : (
                <Link
                  href={knowledgeMenuNavState.href ?? '/knowledge'}
                  prefetch={false}
                  onMouseEnter={() =>
                    warmDashboardHotRoute(knowledgeMenuNavState.href ?? '/knowledge')
                  }
                  onFocus={() => warmDashboardHotRoute(knowledgeMenuNavState.href ?? '/knowledge')}
                  onClick={(event) => {
                    handleDashboardNavClick(event, knowledgeMenuNavState.href ?? '/knowledge')
                    setOtherMenuPath(null)
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                    pathname?.includes('/knowledge')
                      ? 'bg-[#242A40]/8 text-[#242A40]'
                      : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  <HiOutlineSquare3Stack3D size={16} />
                  {tNav('knowledgeBase')}
                </Link>
              )}
            </div>
            <div className="mt-3 space-y-1">
              {effectiveOnboardingState?.showNavigationEntry && (
                <Link
                  href="/onboarding"
                  prefetch={false}
                  onMouseEnter={() => warmDashboardHotRoute('/onboarding')}
                  onFocus={() => warmDashboardHotRoute('/onboarding')}
                  onClick={(event) => {
                    handleDashboardNavClick(event, '/onboarding')
                    setOtherMenuPath(null)
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                    pathname?.includes('/onboarding')
                      ? 'bg-[#242A40]/8 text-[#242A40]'
                      : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  <Rocket size={16} />
                  {tNav('onboarding')}
                </Link>
              )}
              {simulatorMenuNavState.isLocked ? (
                <button
                  type="button"
                  disabled
                  aria-label={`${tNav('simulator')} (${tSidebar('lockedLabel')})`}
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl bg-slate-100/80 px-3 py-2.5 text-left text-sm font-medium text-slate-400"
                >
                  <Puzzle size={16} />
                  <span>{tNav('simulator')}</span>
                  <span className="ml-auto inline-flex items-center rounded-full border border-slate-200 bg-white p-1 text-slate-400">
                    <Lock size={10} />
                  </span>
                </button>
              ) : (
                <Link
                  href={simulatorMenuNavState.href ?? '/simulator'}
                  prefetch={false}
                  onMouseEnter={() =>
                    warmDashboardHotRoute(simulatorMenuNavState.href ?? '/simulator')
                  }
                  onFocus={() => warmDashboardHotRoute(simulatorMenuNavState.href ?? '/simulator')}
                  onClick={(event) => {
                    handleDashboardNavClick(event, simulatorMenuNavState.href ?? '/simulator')
                    setOtherMenuPath(null)
                  }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Puzzle size={16} />
                  {tNav('simulator')}
                </Link>
              )}
              <Link
                href={settingsMenuNavState.href ?? '/settings'}
                prefetch={false}
                onMouseEnter={() => warmDashboardHotRoute(settingsMenuNavState.href ?? '/settings')}
                onFocus={() => warmDashboardHotRoute(settingsMenuNavState.href ?? '/settings')}
                onClick={(event) => {
                  handleDashboardNavClick(event, settingsMenuNavState.href ?? '/settings')
                  setOtherMenuPath(null)
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <Settings size={16} />
                {tNav('settings')}
              </Link>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut size={16} />
                  {tNav('signout')}
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div
          className={cn(
            'grid gap-1 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2',
            navGridColumnsClass
          )}
        >
          {navItems.map((item) => {
            const isActive = activeItem === item.id
            const Icon = isActive ? item.activeIcon : item.icon
            const itemLabel = item.locked
              ? `${item.label} (${tSidebar('lockedLabel')})`
              : item.label

            if (item.locked) {
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled
                  title={itemLabel}
                  aria-label={itemLabel}
                  className="flex cursor-not-allowed flex-col items-center justify-center rounded-xl py-1.5 text-[11px] font-medium text-slate-400"
                >
                  <span className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                    <Icon size={18} />
                  </span>
                  {item.label}
                </button>
              )
            }

            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                className={cn(
                  'flex flex-col items-center justify-center rounded-xl py-1.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-[#242A40]' : 'text-slate-500 hover:text-slate-900'
                )}
                onMouseEnter={() => warmDashboardHotRoute(item.href)}
                onFocus={() => warmDashboardHotRoute(item.href)}
                onClick={(event) => handleDashboardNavClick(event, item.href)}
              >
                <span
                  className={cn(
                    'mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                    isActive ? 'bg-[#242A40]/10' : 'bg-transparent'
                  )}
                >
                  <Icon size={18} />
                </span>
                {item.label}
              </Link>
            )
          })}

          <button
            type="button"
            aria-expanded={isOtherOpen}
            onClick={() =>
              setOtherMenuPath((activeMenuPath) => (activeMenuPath === pathname ? null : pathname))
            }
            className={cn(
              'flex flex-col items-center justify-center rounded-xl py-1.5 text-[11px] font-medium transition-colors',
              activeItem === 'other' || isOtherOpen
                ? 'text-[#242A40]'
                : 'text-slate-500 hover:text-slate-900'
            )}
          >
            <span
              className={cn(
                'mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                activeItem === 'other' || isOtherOpen ? 'bg-[#242A40]/10' : 'bg-transparent'
              )}
            >
              <MoreHorizontal size={18} />
            </span>
            {tNav('other')}
          </button>
        </div>
      </nav>
    </>
  )
}
