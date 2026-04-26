'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { updateOrgAiSettings } from '@/lib/ai/settings'
import type { AiBotMode, OrganizationBillingAccount } from '@/types/database'
import { shouldEnableManualRoutePrefetch } from '@/design/manual-prefetch'
import {
  dispatchDashboardRouteTransitionStart,
  primeDashboardRoute,
  resolveDashboardPrefetchTargets,
  shouldStartDashboardRouteTransition,
} from '@/design/dashboard-route-transition'
import { useDashboardRouteState } from '@/design/dashboard-route-state'
import {
  buildOrganizationBillingSnapshot,
  type OrganizationBillingSnapshot,
} from '@/lib/billing/snapshot'
import { buildBillingRefreshSignal } from '@/lib/billing/refresh-signal'
import { BILLING_UPDATED_EVENT } from '@/lib/billing/events'
import {
  HiMiniCalendarDays,
  HiOutlineCalendarDays,
  HiMiniChatBubbleBottomCenterText,
  HiOutlineChatBubbleBottomCenterText,
  HiMiniSquares2X2,
  HiOutlineSquares2X2,
  HiMiniBuildingOffice2,
  HiOutlineBuildingOffice2,
  HiMiniBanknotes,
  HiOutlineBanknotes,
  HiMiniUser,
  HiOutlineUser,
  HiMiniUsers,
  HiOutlineUsers,
  HiMiniPuzzlePiece,
  HiOutlinePuzzlePiece,
  HiMiniSparkles,
  HiOutlineSparkles,
  HiMiniSquare3Stack3D,
  HiOutlineSquare3Stack3D,
  HiMiniRocketLaunch,
  HiOutlineRocketLaunch,
  HiMiniCog6Tooth,
  HiOutlineCog6Tooth,
  HiMiniBeaker,
  HiOutlineBeaker,
} from 'react-icons/hi2'
import {
  AlertCircle,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  Building2,
  ChevronDown,
  Lock,
  LogOut,
  RotateCcw,
} from 'lucide-react'
import {
  calculateSidebarBillingProgressSegments,
  isLowCreditWarningVisible,
} from '@/lib/billing/sidebar-progress'
import {
  formatSidebarBillingCompactCredits,
  formatSidebarBillingCredits,
  formatSidebarBillingDate,
} from '@/lib/billing/sidebar-format'
import { resolveWorkspaceAccessState } from '@/lib/billing/workspace-access'
import { resolveBillingLockedNavItem } from '@/lib/billing/navigation-lock'
import {
  normalizeMainSidebarBotMode,
  resolveMainSidebarBotMode,
  resolveMainSidebarInitialBotModeState,
  resolveMainSidebarBotModeTone,
} from '@/design/main-sidebar-bot-mode'
import {
  dispatchInboxUnreadState,
  listenForInboxUnreadState,
  listenForInboxUnreadUpdates,
  shouldRefreshInboxUnreadIndicator,
} from '@/lib/inbox/unread-events'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design/Dropdown'
import { Avatar } from '@/design/primitives'
import {
  hydrateMainSidebarSectionState,
  MAIN_SIDEBAR_SECTIONS_STORAGE_KEY,
  syncMainSidebarSectionState,
  toggleMainSidebarSection,
} from '@/design/main-sidebar-sections'
import { resolveDashboardTypographyVariables } from '@/design/dashboard-typography'
import type { OrganizationOnboardingShellState } from '@/lib/onboarding/state'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'leadqualifier.sidebarCollapsed'

interface ActiveOrganizationSummary {
  id: string
  name: string
  slug: string
}

function isActiveOrganizationSummary(value: unknown): value is ActiveOrganizationSummary {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.slug === 'string'
  )
}

function sortOrganizations(organizations: ActiveOrganizationSummary[]) {
  return [...organizations].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )
}

function mergeOrganizations(
  current: ActiveOrganizationSummary[],
  incoming: ActiveOrganizationSummary[]
) {
  const lookup = new Map<string, ActiveOrganizationSummary>()
  for (const organization of current) {
    lookup.set(organization.id, organization)
  }
  for (const organization of incoming) {
    lookup.set(organization.id, organization)
  }
  return sortOrganizations(Array.from(lookup.values()))
}

interface SidebarHoverTooltipProps {
  children: ReactNode
  content: ReactNode
  enabled?: boolean
  immediate?: boolean
  className?: string
  panelClassName?: string
}

function SidebarHoverTooltip({
  children,
  content,
  enabled = true,
  immediate = false,
  className,
  panelClassName,
}: SidebarHoverTooltipProps) {
  if (!enabled) {
    return <>{children}</>
  }

  return (
    <div className={cn('relative group/sidebar-tooltip', className)}>
      {children}
      <div
        className={cn(
          'pointer-events-none absolute left-full top-1/2 z-[140] ml-2 w-max max-w-64 -translate-y-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 shadow-lg opacity-0 invisible',
          immediate
            ? 'translate-x-0 transition-none'
            : 'translate-x-[-2px] transition-all duration-150 ease-out motion-reduce:transition-none',
          'group-hover/sidebar-tooltip:visible group-hover/sidebar-tooltip:translate-x-0 group-hover/sidebar-tooltip:opacity-100',
          'group-has-[:focus-visible]/sidebar-tooltip:visible group-has-[:focus-visible]/sidebar-tooltip:translate-x-0 group-has-[:focus-visible]/sidebar-tooltip:opacity-100',
          panelClassName
        )}
        role="tooltip"
      >
        {content}
      </div>
    </div>
  )
}

interface MainSidebarProps {
  userName?: string
  userAvatarUrl?: string | null
  isSystemAdmin?: boolean
  organizations?: ActiveOrganizationSummary[]
  activeOrganizationId?: string | null
  readOnlyTenantMode?: boolean
  canAccessQaLabAdmin?: boolean
  onboardingState?: OrganizationOnboardingShellState | null
  initialBotMode?: AiBotMode | null
  initialBotModeUnlockRequired?: boolean
  initialBillingSnapshot?: OrganizationBillingSnapshot | null
}

export function MainSidebar({
  userName,
  userAvatarUrl = null,
  isSystemAdmin = false,
  organizations = [],
  activeOrganizationId = null,
  readOnlyTenantMode = false,
  canAccessQaLabAdmin = false,
  onboardingState = null,
  initialBotMode = null,
  initialBotModeUnlockRequired = false,
  initialBillingSnapshot = null,
}: MainSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const committedPathWithoutLocale = pathname.replace(/^\/[a-z]{2}\//, '/')
  const { activePath } = useDashboardRouteState(pathname)
  const locale = useLocale()
  const tNav = useTranslations('nav')
  const tCommon = useTranslations('common')
  const tSidebar = useTranslations('mainSidebar')
  const tAiSettings = useTranslations('aiSettings')

  const [collapsed, setCollapsed] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [hasPendingSuggestions, setHasPendingSuggestions] = useState(false)
  const [organizationId, setOrganizationId] = useState<string | null>(activeOrganizationId)
  const [organizationOptions, setOrganizationOptions] = useState<ActiveOrganizationSummary[]>(
    sortOrganizations(organizations)
  )
  const [isLoadingOrganizationOptions, setIsLoadingOrganizationOptions] = useState(false)
  const [hasLoadedOrganizationOptions, setHasLoadedOrganizationOptions] = useState(!isSystemAdmin)
  const initialBotModeState = resolveMainSidebarInitialBotModeState({
    organizationId: activeOrganizationId,
    initialBotMode,
  })
  const [botMode, setBotMode] = useState<AiBotMode>(initialBotModeState.botMode)
  const [botModeUnlockRequired, setBotModeUnlockRequired] = useState(
    Boolean(initialBotModeUnlockRequired)
  )
  const [isBotModeLoading, setIsBotModeLoading] = useState(initialBotModeState.isLoading)
  const [isBotModeDropdownOpen, setIsBotModeDropdownOpen] = useState(false)
  const [isUpdatingBotMode, setIsUpdatingBotMode] = useState(false)
  const [botModeUpdateError, setBotModeUpdateError] = useState<string | null>(null)
  const [billingSnapshot, setBillingSnapshot] = useState<OrganizationBillingSnapshot | null>(
    initialBillingSnapshot
  )
  const [isBillingDetailsExpanded, setIsBillingDetailsExpanded] = useState(false)
  const [orgSearch, setOrgSearch] = useState('')
  const [isSwitchingOrg, setIsSwitchingOrg] = useState(false)
  const [isOrgPickerOpen, setIsOrgPickerOpen] = useState(false)
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const localePrefixMatch = pathname.match(/^\/([a-z]{2})(\/|$)/)
  const localePrefix =
    localePrefixMatch && localePrefixMatch[1] !== 'tr' ? `/${localePrefixMatch[1]}` : ''

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const hasHydratedSectionStateRef = useRef(false)
  if (!supabaseRef.current) {
    supabaseRef.current = createClient()
  }
  const supabase = supabaseRef.current

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

  const currentOrganization = useMemo(
    () =>
      organizationOptions.find((organization) => organization.id === organizationId) ??
      organizations.find((organization) => organization.id === organizationId) ??
      null,
    [organizationId, organizationOptions, organizations]
  )

  const filteredOrganizations = useMemo(() => {
    const query = orgSearch.trim().toLowerCase()
    if (!query) return organizationOptions
    return organizationOptions.filter((organization) => {
      return (
        organization.name.toLowerCase().includes(query) ||
        organization.slug.toLowerCase().includes(query)
      )
    })
  }, [orgSearch, organizationOptions])
  const billingRefreshSignal = useMemo(
    () => buildBillingRefreshSignal(searchParams, pathname),
    [pathname, searchParams]
  )

  const loadOrganizationOptions = useCallback(async () => {
    if (!isSystemAdmin || hasLoadedOrganizationOptions || isLoadingOrganizationOptions) {
      return
    }

    setIsLoadingOrganizationOptions(true)
    try {
      const response = await fetch('/api/organizations/active', {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Failed to load organization options')
      }

      const payload = (await response.json()) as { organizations?: unknown[] }
      const nextOrganizations = (payload.organizations ?? []).filter(isActiveOrganizationSummary)
      if (nextOrganizations.length > 0) {
        setOrganizationOptions((current) => mergeOrganizations(current, nextOrganizations))
      }
      setHasLoadedOrganizationOptions(true)
    } catch (error) {
      console.error(error)
    } finally {
      setIsLoadingOrganizationOptions(false)
    }
  }, [hasLoadedOrganizationOptions, isLoadingOrganizationOptions, isSystemAdmin])

  const refreshUnread = useCallback(
    async (orgId: string) => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id')
        .eq('organization_id', orgId)
        .gt('unread_count', 0)
        .limit(1)

      if (error) {
        console.error('Failed to load unread indicator', error)
        return
      }

      const nextHasUnread = (data ?? []).length > 0
      setHasUnread(nextHasUnread)
      dispatchInboxUnreadState({
        organizationId: orgId,
        hasUnread: nextHasUnread,
      })
    },
    [supabase]
  )

  const refreshPendingSuggestions = useCallback(
    async (orgId: string) => {
      const { data, error } = await supabase
        .from('offering_profile_suggestions')
        .select('id')
        .eq('organization_id', orgId)
        .is('archived_at', null)
        .or('status.eq.pending,status.is.null')
        .limit(1)

      if (error) {
        console.error('Failed to load pending suggestion indicator', error)
        return
      }

      setHasPendingSuggestions((data ?? []).length > 0)
    },
    [supabase]
  )

  const fetchBotMode = useCallback(
    async (orgId: string) => {
      const { data, error } = await supabase
        .from('organization_ai_settings')
        .select('bot_mode, bot_mode_unlock_required')
        .eq('organization_id', orgId)
        .maybeSingle()

      if (error) {
        console.error('Failed to load bot mode', error)
        return {
          botMode: 'active' as AiBotMode,
          botModeUnlockRequired: false,
        }
      }

      return {
        botMode: normalizeMainSidebarBotMode(data?.bot_mode),
        botModeUnlockRequired: data?.bot_mode_unlock_required === true,
      }
    },
    [supabase]
  )

  const refreshBillingSnapshot = useCallback(
    async (orgId: string) => {
      const { data, error } = await supabase
        .from('organization_billing_accounts')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle()

      if (error) {
        console.error('Failed to load billing status', error)
        setBillingSnapshot(null)
        return
      }

      if (!data) {
        setBillingSnapshot(null)
        return
      }

      setBillingSnapshot(buildOrganizationBillingSnapshot(data as OrganizationBillingAccount))
    },
    [supabase]
  )

  const handleOrganizationSwitch = useCallback(
    async (nextOrganizationId: string) => {
      if (
        !isSystemAdmin ||
        isSwitchingOrg ||
        !nextOrganizationId ||
        nextOrganizationId === organizationId
      ) {
        return
      }

      setIsSwitchingOrg(true)
      try {
        const response = await fetch('/api/organizations/active', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ organizationId: nextOrganizationId }),
        })

        if (!response.ok) {
          throw new Error('Failed to switch organization context')
        }

        setOrganizationId(nextOrganizationId)
        setIsOrgPickerOpen(false)
        setOrgSearch('')
        router.refresh()
      } catch (error) {
        console.error(error)
      } finally {
        setIsSwitchingOrg(false)
      }
    },
    [isSystemAdmin, isSwitchingOrg, organizationId, router]
  )

  const handleOrganizationReset = useCallback(async () => {
    if (!isSystemAdmin || isSwitchingOrg) return

    setIsSwitchingOrg(true)
    try {
      const response = await fetch('/api/organizations/active', {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to reset organization context')
      }

      setOrganizationId(null)
      setIsOrgPickerOpen(false)
      setOrgSearch('')
      router.refresh()
    } catch (error) {
      console.error(error)
    } finally {
      setIsSwitchingOrg(false)
    }
  }, [isSwitchingOrg, isSystemAdmin, router])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
      setCollapsed(stored === 'true')
    } catch {
      setCollapsed(false)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false')
    } catch {
      // ignore persistence errors
    }
  }, [collapsed])

  useEffect(() => {
    setOrganizationId(activeOrganizationId)
  }, [activeOrganizationId])

  useEffect(() => {
    const normalizedOrganizations = sortOrganizations(organizations)

    if (!isSystemAdmin) {
      setOrganizationOptions(normalizedOrganizations)
      setHasLoadedOrganizationOptions(true)
      return
    }

    if (normalizedOrganizations.length === 0) return
    setOrganizationOptions((current) => mergeOrganizations(current, normalizedOrganizations))

    if (normalizedOrganizations.length > 1) {
      setHasLoadedOrganizationOptions(true)
    }
  }, [isSystemAdmin, organizations])

  useEffect(() => {
    if (!isSystemAdmin || !isOrgPickerOpen) return
    loadOrganizationOptions()
  }, [isOrgPickerOpen, isSystemAdmin, loadOrganizationOptions])

  useEffect(() => {
    let isMounted = true
    let deferredLoadTimer: number | null = null

    if (!organizationId || isDesktopViewport !== true) {
      setHasUnread(false)
      setHasPendingSuggestions(false)
      setBotMode('active')
      setBotModeUnlockRequired(false)
      setIsBotModeLoading(false)
      setIsBotModeDropdownOpen(false)
      setIsUpdatingBotMode(false)
      setBotModeUpdateError(null)
      setBillingSnapshot(null)
      setIsBillingDetailsExpanded(false)
      return
    }

    const initialBotModeState = resolveMainSidebarInitialBotModeState({
      organizationId,
      initialBotMode,
    })
    setBotMode(initialBotModeState.botMode)
    setBotModeUnlockRequired(Boolean(initialBotModeUnlockRequired))
    setIsBotModeLoading(initialBotModeState.isLoading)
    setBillingSnapshot(initialBillingSnapshot)

    refreshUnread(organizationId)
    deferredLoadTimer = window.setTimeout(() => {
      void refreshPendingSuggestions(organizationId)
      if (!initialBillingSnapshot) {
        void refreshBillingSnapshot(organizationId)
      }

      if (initialBotModeState.isLoading) {
        const loadBotMode = async () => {
          const nextBotModeState = await fetchBotMode(organizationId)
          if (!isMounted) return
          setBotMode(nextBotModeState.botMode)
          setBotModeUnlockRequired(nextBotModeState.botModeUnlockRequired)
          setIsBotModeLoading(false)
          setBotModeUpdateError(null)
        }
        void loadBotMode()
      }
    }, 150)

    return () => {
      isMounted = false
      if (deferredLoadTimer !== null) {
        window.clearTimeout(deferredLoadTimer)
      }
    }
  }, [
    fetchBotMode,
    initialBillingSnapshot,
    initialBotMode,
    initialBotModeUnlockRequired,
    isDesktopViewport,
    organizationId,
    refreshBillingSnapshot,
    refreshPendingSuggestions,
    refreshUnread,
  ])

  useEffect(() => {
    if (isDesktopViewport !== true) return
    if (!organizationId) return
    if (!billingRefreshSignal) return
    refreshBillingSnapshot(organizationId)
  }, [billingRefreshSignal, isDesktopViewport, organizationId, refreshBillingSnapshot])

  useEffect(() => {
    if (isDesktopViewport !== true) return
    if (!organizationId) return
    if (committedPathWithoutLocale !== '/inbox') return
    void refreshUnread(organizationId)
  }, [committedPathWithoutLocale, isDesktopViewport, organizationId, refreshUnread])

  useEffect(() => {
    if (billingSnapshot?.membershipState !== 'premium_active') {
      setIsBillingDetailsExpanded(false)
    }
  }, [billingSnapshot?.membershipState])

  useEffect(() => {
    if (isDesktopViewport !== true) return
    if (!organizationId) return
    let unreadChannel: ReturnType<typeof supabase.channel> | null = null
    let suggestionChannel: ReturnType<typeof supabase.channel> | null = null
    let billingChannel: ReturnType<typeof supabase.channel> | null = null
    let isMounted = true

    const setupRealtime = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!isMounted) return

      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token)
      }

      unreadChannel = supabase
        .channel(`sidebar_unread_${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => {
            refreshUnread(organizationId)
          }
        )
        .subscribe()

      suggestionChannel = supabase
        .channel(`sidebar_suggestions_${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'offering_profile_suggestions',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => {
            refreshPendingSuggestions(organizationId)
          }
        )
        .subscribe()

      billingChannel = supabase
        .channel(`sidebar_billing_${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'organization_billing_accounts',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => {
            refreshBillingSnapshot(organizationId)
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'organization_credit_ledger',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => {
            refreshBillingSnapshot(organizationId)
          }
        )
        .subscribe()
    }

    setupRealtime()

    return () => {
      isMounted = false
      if (unreadChannel) {
        supabase.removeChannel(unreadChannel)
      }
      if (suggestionChannel) {
        supabase.removeChannel(suggestionChannel)
      }
      if (billingChannel) {
        supabase.removeChannel(billingChannel)
      }
    }
  }, [
    isDesktopViewport,
    organizationId,
    refreshBillingSnapshot,
    refreshPendingSuggestions,
    refreshUnread,
    supabase,
  ])

  useEffect(() => {
    if (isDesktopViewport !== true) return
    if (!organizationId) return
    let isMounted = true
    const handler = () => {
      const loadBotMode = async () => {
        const nextBotModeState = await fetchBotMode(organizationId)
        if (!isMounted) return
        setBotMode(nextBotModeState.botMode)
        setBotModeUnlockRequired(nextBotModeState.botModeUnlockRequired)
        setIsBotModeLoading(false)
        setBotModeUpdateError(null)
      }
      void loadBotMode()
    }
    window.addEventListener('ai-settings-updated', handler)
    return () => {
      isMounted = false
      window.removeEventListener('ai-settings-updated', handler)
    }
  }, [fetchBotMode, isDesktopViewport, organizationId])

  useEffect(() => {
    if (isDesktopViewport !== true) return
    if (!organizationId) return
    const handler = () => refreshPendingSuggestions(organizationId)
    window.addEventListener('pending-suggestions-updated', handler)
    return () => window.removeEventListener('pending-suggestions-updated', handler)
  }, [isDesktopViewport, organizationId, refreshPendingSuggestions])

  useEffect(() => {
    if (isDesktopViewport !== true) return
    if (!organizationId) return
    const handler = () => refreshBillingSnapshot(organizationId)
    window.addEventListener(BILLING_UPDATED_EVENT, handler)
    return () => window.removeEventListener(BILLING_UPDATED_EVENT, handler)
  }, [isDesktopViewport, organizationId, refreshBillingSnapshot])

  useEffect(() => {
    if (isDesktopViewport !== true) return
    if (!organizationId) return
    return listenForInboxUnreadUpdates((detail) => {
      if (!shouldRefreshInboxUnreadIndicator(organizationId, detail)) return
      void refreshUnread(organizationId)
    })
  }, [isDesktopViewport, organizationId, refreshUnread])

  useEffect(() => {
    if (isDesktopViewport !== true) return
    if (!organizationId) return
    return listenForInboxUnreadState((detail) => {
      if (!shouldRefreshInboxUnreadIndicator(organizationId, detail)) return
      if (typeof detail.hasUnread !== 'boolean') return
      setHasUnread(detail.hasUnread)
    })
  }, [isDesktopViewport, organizationId])

  useEffect(() => {
    if (!shouldEnableManualRoutePrefetch('app-shell')) return
    if (isDesktopViewport !== true) return

    const routesToPrefetch = [
      '/inbox',
      '/calendar',
      '/leads',
      '/simulator',
      '/skills',
      '/knowledge',
      '/settings',
      '/settings/plans',
      '/settings/profile',
      '/settings/organization',
      '/settings/ai',
      '/settings/channels',
      '/settings/billing',
    ]

    if (isSystemAdmin) {
      routesToPrefetch.push(
        '/admin',
        '/admin/billing',
        '/admin/organizations',
        '/admin/leads',
        '/admin/users'
      )
      if (canAccessQaLabAdmin) {
        routesToPrefetch.push('/admin/qa-lab')
      }
    }

    const uniqueRoutes = Array.from(new Set(routesToPrefetch))
    const prefetchRoutes = () => {
      resolveDashboardPrefetchTargets(uniqueRoutes, pathname).forEach((route) => {
        router.prefetch(`${localePrefix}${route}`)
      })
    }

    const timeoutId = setTimeout(prefetchRoutes, 250)
    return () => clearTimeout(timeoutId)
  }, [canAccessQaLabAdmin, isDesktopViewport, isSystemAdmin, localePrefix, pathname, router])

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

  const sections = useMemo(
    () => [
      {
        id: 'workspace',
        label: tSidebar('workspace'),
        items: [
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
            id: 'leads',
            href: '/leads',
            label: tNav('leads'),
            icon: HiOutlineUser,
            activeIcon: HiMiniUser,
          },
          {
            id: 'simulator',
            href: '/simulator',
            label: tNav('simulator'),
            icon: HiOutlinePuzzlePiece,
            activeIcon: HiMiniPuzzlePiece,
          },
        ],
      },
      {
        id: 'ai',
        label: tSidebar('aiTools'),
        items: [
          {
            id: 'skills',
            href: '/skills',
            label: tNav('skills'),
            icon: HiOutlineSparkles,
            activeIcon: HiMiniSparkles,
          },
          {
            id: 'knowledge',
            href: '/knowledge',
            label: tNav('knowledgeBase'),
            icon: HiOutlineSquare3Stack3D,
            activeIcon: HiMiniSquare3Stack3D,
          },
        ],
      },
      {
        id: 'other',
        label: tSidebar('other'),
        items: [
          {
            id: 'settings',
            href: '/settings/ai',
            label: tNav('settings'),
            icon: HiOutlineCog6Tooth,
            activeIcon: HiMiniCog6Tooth,
          },
        ],
      },
    ],
    [tNav, tSidebar]
  )
  const adminSections = useMemo(() => {
    if (!isSystemAdmin) return []

    const adminItems = [
      {
        id: 'admin-dashboard',
        href: '/admin',
        label: tSidebar('adminDashboard'),
        icon: HiOutlineSquares2X2,
        activeIcon: HiMiniSquares2X2,
      },
      {
        id: 'admin-organizations',
        href: '/admin/organizations',
        label: tSidebar('adminOrganizations'),
        icon: HiOutlineBuildingOffice2,
        activeIcon: HiMiniBuildingOffice2,
      },
      {
        id: 'admin-billing',
        href: '/admin/billing',
        label: tSidebar('adminBilling'),
        icon: HiOutlineBanknotes,
        activeIcon: HiMiniBanknotes,
      },
      {
        id: 'admin-leads',
        href: '/admin/leads',
        label: tSidebar('adminLeads'),
        icon: HiOutlineUser,
        activeIcon: HiMiniUser,
      },
      {
        id: 'admin-users',
        href: '/admin/users',
        label: tSidebar('adminUsers'),
        icon: HiOutlineUsers,
        activeIcon: HiMiniUsers,
      },
    ]

    if (canAccessQaLabAdmin) {
      adminItems.push({
        id: 'admin-qa-lab',
        href: '/admin/qa-lab',
        label: tSidebar('adminQaLab'),
        icon: HiOutlineBeaker,
        activeIcon: HiMiniBeaker,
      })
    }

    return [
      {
        id: 'admin',
        label: tSidebar('adminSection'),
        items: adminItems,
      },
    ]
  }, [canAccessQaLabAdmin, isSystemAdmin, tSidebar])

  const toggleLabel = collapsed ? tCommon('expandSidebar') : tCommon('collapseSidebar')
  const workspaceAccess = useMemo(
    () => resolveWorkspaceAccessState(billingSnapshot),
    [billingSnapshot]
  )
  const shouldRestrictToBilling = workspaceAccess.isLocked && !isSystemAdmin
  const isBotModeLockedByOnboarding =
    botModeUnlockRequired || onboardingState?.isComplete === false
  const effectiveBotMode = resolveMainSidebarBotMode({
    botMode,
    isWorkspaceLocked: shouldRestrictToBilling || isBotModeLockedByOnboarding,
  })
  const botModeTone = resolveMainSidebarBotModeTone(effectiveBotMode)
  const botModeToneClassMap = {
    emerald: {
      surface: 'border-emerald-200 bg-emerald-100/85 text-emerald-950 hover:bg-emerald-100',
      badge: 'bg-emerald-200/70 text-emerald-900',
      dot: 'bg-emerald-500',
      selected: 'border-emerald-300 bg-emerald-50',
      selectedIcon: 'bg-emerald-100 text-emerald-700',
      hover: 'hover:border-emerald-200 hover:bg-emerald-50/60',
    },
    amber: {
      surface: 'border-amber-200 bg-amber-100/85 text-amber-950 hover:bg-amber-100',
      badge: 'bg-amber-200/70 text-amber-900',
      dot: 'bg-amber-500',
      selected: 'border-amber-300 bg-amber-50',
      selectedIcon: 'bg-amber-100 text-amber-700',
      hover: 'hover:border-amber-200 hover:bg-amber-50/60',
    },
    rose: {
      surface: 'border-rose-200 bg-rose-100/85 text-rose-950 hover:bg-rose-100',
      badge: 'bg-rose-200/70 text-rose-900',
      dot: 'bg-rose-500',
      selected: 'border-rose-300 bg-rose-50',
      selectedIcon: 'bg-rose-100 text-rose-700',
      hover: 'hover:border-rose-200 hover:bg-rose-50/60',
    },
  } as const
  const loadingBotModeToneClasses = {
    surface: 'border-slate-200 bg-slate-100/85 text-slate-700',
    badge: 'bg-slate-200 text-slate-700',
    dot: 'bg-slate-400',
    selected: 'border-slate-300 bg-slate-100',
    selectedIcon: 'bg-slate-200 text-slate-700',
    hover: 'hover:border-slate-200 hover:bg-slate-100',
  } as const
  const currentBotModeToneClasses = isBotModeLoading
    ? loadingBotModeToneClasses
    : botModeToneClassMap[botModeTone]
  const botModeLabel = useMemo(() => {
    if (isBotModeLoading) return tCommon('loading')
    if (effectiveBotMode === 'shadow') return tSidebar('botStatusShadow')
    if (effectiveBotMode === 'off') return tSidebar('botStatusOff')
    return tSidebar('botStatusActive')
  }, [effectiveBotMode, isBotModeLoading, tCommon, tSidebar])
  const botModeOptions = useMemo<
    Array<{ value: AiBotMode; label: string; description: string }>
  >(() => {
    return [
      {
        value: 'active',
        label: tAiSettings('botModeActive'),
        description: tAiSettings('botModeActiveDescription'),
      },
      {
        value: 'shadow',
        label: tAiSettings('botModeShadow'),
        description: tAiSettings('botModeShadowDescription'),
      },
      {
        value: 'off',
        label: tAiSettings('botModeOff'),
        description: tAiSettings('botModeOffDescription'),
      },
    ]
  }, [tAiSettings])
  const canQuickSwitchBotMode =
    Boolean(organizationId)
    && !shouldRestrictToBilling
    && !readOnlyTenantMode
    && !isBotModeLoading
    && !isBotModeLockedByOnboarding
  const handleQuickBotModeChange = useCallback(
    async (nextBotMode: AiBotMode) => {
      if (!organizationId || isUpdatingBotMode || !canQuickSwitchBotMode) {
        return
      }
      if (nextBotMode === botMode) return

      const previousBotMode = botMode
      setBotMode(nextBotMode)
      setIsUpdatingBotMode(true)
      setBotModeUpdateError(null)

      try {
        const savedSettings = await updateOrgAiSettings({
          bot_mode: nextBotMode,
        })
        setBotMode(savedSettings.bot_mode)
        setBotModeUnlockRequired(savedSettings.bot_mode_unlock_required)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ai-settings-updated'))
        }
      } catch (error) {
        console.error('Failed to quick switch bot mode', error)
        setBotMode(previousBotMode)
        const message = error instanceof Error ? error.message : ''
        setBotModeUpdateError(
          message === 'BOT_MODE_LOCKED_BY_ONBOARDING'
            ? tSidebar('botStatusQuickSwitchOnboardingLocked')
            : tSidebar('botStatusQuickSaveError')
        )
      } finally {
        setIsUpdatingBotMode(false)
      }
    },
    [botMode, canQuickSwitchBotMode, isUpdatingBotMode, organizationId, tSidebar]
  )
  const botModeQuickSwitchHelperText = useMemo(() => {
    if (isBotModeLoading) return tSidebar('botStatusQuickSwitchSaving')
    if (readOnlyTenantMode) return tSidebar('botStatusQuickSwitchReadOnly')
    if (shouldRestrictToBilling) return tSidebar('botStatusQuickSwitchLocked')
    if (onboardingState?.isComplete === false) return tSidebar('botStatusQuickSwitchOnboardingLocked')
    if (isBotModeLockedByOnboarding) return tSidebar('botStatusQuickSwitchOnboardingLocked')
    return tSidebar('botStatusQuickSwitchHelp')
  }, [
    isBotModeLoading,
    isBotModeLockedByOnboarding,
    onboardingState?.isComplete,
    readOnlyTenantMode,
    shouldRestrictToBilling,
    tSidebar
  ])
  const currentBotModeOption = useMemo(() => {
    if (isBotModeLoading) {
      return {
        value: 'active' as const,
        label: tCommon('loading'),
        description: tSidebar('botStatusQuickSwitchSaving'),
      }
    }
    return (
      botModeOptions.find((option) => option.value === effectiveBotMode) ?? {
        value: 'active' as const,
        label: tAiSettings('botModeActive'),
        description: tAiSettings('botModeActiveDescription'),
      }
    )
  }, [botModeOptions, effectiveBotMode, isBotModeLoading, tAiSettings, tCommon, tSidebar])
  const canAccessTenantModules = !isSystemAdmin || Boolean(organizationId)
  const settingsNavState = resolveBillingLockedNavItem(
    {
      id: 'settings',
      href: '/settings/ai',
    },
    shouldRestrictToBilling
  )
  const navigationSections = useMemo(
    () => (canAccessTenantModules ? [...sections, ...adminSections] : adminSections),
    [adminSections, canAccessTenantModules, sections]
  )
  const navigationSectionIds = useMemo(
    () => navigationSections.map((section) => section.id),
    [navigationSections]
  )

  useEffect(() => {
    setExpandedSections((current) => {
      if (!hasHydratedSectionStateRef.current) {
        hasHydratedSectionStateRef.current = true
        let storedValue: string | null = null

        try {
          storedValue = localStorage.getItem(MAIN_SIDEBAR_SECTIONS_STORAGE_KEY)
        } catch {
          storedValue = null
        }

        return hydrateMainSidebarSectionState({
          sectionIds: navigationSectionIds,
          storedValue,
        })
      }

      return syncMainSidebarSectionState({
        sectionIds: navigationSectionIds,
        currentState: current,
      })
    })
  }, [navigationSectionIds])

  useEffect(() => {
    if (!hasHydratedSectionStateRef.current || Object.keys(expandedSections).length === 0) {
      return
    }

    try {
      localStorage.setItem(MAIN_SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(expandedSections))
    } catch {
      // ignore persistence errors
    }
  }, [expandedSections])

  const handleSectionToggle = useCallback((sectionId: string) => {
    setExpandedSections((current) => toggleMainSidebarSection(current, sectionId))
  }, [])
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
  const collapsedBillingRingBackground = useMemo(() => {
    const packagePercent = Math.max(0, Math.min(100, billingProgressSegments.packagePercent))
    const topupPercent = Math.max(0, Math.min(100, billingProgressSegments.topupPercent))
    const totalPercent = Math.max(0, Math.min(100, packagePercent + topupPercent))

    if (totalPercent <= 0) {
      return 'conic-gradient(#e2e8f0 0deg 360deg)'
    }

    const packageDegrees = (packagePercent / 100) * 360
    const topupDegrees = (topupPercent / 100) * 360
    const filledDegrees = (totalPercent / 100) * 360

    if (topupDegrees > 0) {
      return `conic-gradient(#242A40 0deg ${packageDegrees}deg, #9333ea ${packageDegrees}deg ${packageDegrees + topupDegrees}deg, #e2e8f0 ${filledDegrees}deg 360deg)`
    }

    return `conic-gradient(#242A40 0deg ${filledDegrees}deg, #e2e8f0 ${filledDegrees}deg 360deg)`
  }, [billingProgressSegments])
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
  const billingPackageRenewalDetail = useMemo(() => {
    if (!billingSnapshot || billingSnapshot.membershipState !== 'premium_active') return null

    if (!billingSnapshot.package.periodEnd) {
      return tSidebar('billingPackageRenewalUnknown')
    }

    const renewalDate = formatSidebarBillingDate(locale, billingSnapshot.package.periodEnd)
    if (renewalDate) {
      return tSidebar('billingPackageRenewalDate', { date: renewalDate })
    }

    return tSidebar('billingPackageRenewalUnknown')
  }, [billingSnapshot, locale, tSidebar])
  const canExpandBillingDetails = billingSnapshot?.membershipState === 'premium_active'
  const sidebarTypographyStyle = useMemo(
    () => resolveDashboardTypographyVariables('sidebar') as CSSProperties,
    []
  )
  const isOnboardingActive = activePath.startsWith('/onboarding')
  const onboardingHighlightProgressLabel = onboardingState
    ? tSidebar('onboardingProgress', {
        completed: String(onboardingState.completedSteps),
        total: String(onboardingState.totalSteps),
      })
    : ''

  return (
    <aside
      className={cn(
        'dashboard-sidebar-type-scale relative flex h-screen shrink-0 flex-col border-r transition-[width] duration-200 motion-reduce:transition-none',
        collapsed
          ? 'w-[76px] border-[#2B3354]/90 bg-[#202744] text-slate-100'
          : 'w-[264px] border-slate-200/80 bg-slate-50/70 text-slate-900'
      )}
      style={sidebarTypographyStyle}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="px-4 pt-4 pb-3">
        <div
          className={cn(
            'flex items-center',
            collapsed ? 'flex-col gap-3' : 'justify-between gap-3'
          )}
        >
          <div
            className={cn('flex items-center', collapsed ? 'w-full justify-center gap-0' : 'gap-3')}
          >
            <div
              className={cn(
                'transition-all duration-200 motion-reduce:transition-none',
                collapsed ? 'w-11 opacity-100' : 'w-[85px] opacity-100'
              )}
            >
              <Image
                src={collapsed ? '/icon-white.svg' : '/logo-black.svg'}
                alt={tCommon('appName')}
                width={collapsed ? 44 : 85}
                height={collapsed ? 44 : 27}
                priority
                className="h-auto w-full"
              />
            </div>
          </div>
          <SidebarHoverTooltip
            enabled={collapsed}
            content={<span className="font-medium text-slate-900">{toggleLabel}</span>}
          >
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md transition focus:outline-none focus-visible:ring-2 motion-reduce:transition-none',
                collapsed
                  ? 'bg-white/10 text-white shadow-none ring-1 ring-white/10 hover:bg-white/16 hover:text-white hover:ring-white/20 focus-visible:ring-white/20'
                  : 'bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-slate-900 hover:ring-slate-300 focus-visible:ring-[#242A40]/20'
              )}
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              title={collapsed ? undefined : toggleLabel}
            >
              {collapsed ? <ArrowRightFromLine size={16} /> : <ArrowLeftFromLine size={16} />}
            </button>
          </SidebarHoverTooltip>
        </div>
      </div>

      {isSystemAdmin && (
        <div className={cn('px-3 pb-2 space-y-2', collapsed && 'px-2')}>
          {collapsed ? (
            <SidebarHoverTooltip
              content={
                <div className="space-y-0.5">
                  <p className="font-semibold text-slate-900">
                    {tSidebar('organizationSwitcherTitle')}
                  </p>
                  <p className="max-w-52 truncate text-slate-600">
                    {currentOrganization?.name ?? tSidebar('organizationSwitcherNoSelection')}
                  </p>
                </div>
              }
              className="flex justify-center"
              panelClassName="max-w-56"
            >
              <button
                type="button"
                onClick={() => setIsOrgPickerOpen(true)}
                title={undefined}
                className={cn(
                  'mx-auto flex h-9 w-9 items-center justify-center rounded-lg border transition',
                  collapsed
                    ? 'border-white/10 bg-white/10 text-slate-200 shadow-none hover:border-white/15 hover:bg-white/16 hover:text-white'
                    : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900'
                )}
              >
                <Building2 size={15} />
              </button>
            </SidebarHoverTooltip>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {tSidebar('organizationSwitcherTitle')}
              </p>
              <p className="mt-2 truncate text-[14px] font-semibold text-slate-900">
                {currentOrganization?.name ?? tSidebar('organizationSwitcherNoSelection')}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {currentOrganization?.slug ?? tSidebar('organizationSwitcherNoSelection')}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsOrgPickerOpen(true)}
                  disabled={isSwitchingOrg}
                  className="inline-flex h-8 items-center rounded-md bg-[#242A40] px-3 text-xs font-semibold text-white transition hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {currentOrganization
                    ? tSidebar('organizationSwitcherChange')
                    : tSidebar('organizationSwitcherSelect')}
                </button>
                <button
                  type="button"
                  disabled={isSwitchingOrg}
                  onClick={handleOrganizationReset}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw size={12} />
                  {tSidebar('organizationSwitcherReset')}
                </button>
              </div>
            </div>
          )}
          {!collapsed && readOnlyTenantMode && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">
              {tSidebar('readOnlyTenantMode')}
            </p>
          )}
        </div>
      )}

      {isSystemAdmin && isOrgPickerOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4"
          onClick={() => {
            if (!isSwitchingOrg) setIsOrgPickerOpen(false)
          }}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-slate-900">
                    {tSidebar('organizationSwitcherModalTitle')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {tSidebar('organizationSwitcherModalDescription')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOrgPickerOpen(false)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  {tSidebar('organizationSwitcherClose')}
                </button>
              </div>
            </div>

            <div className="p-4">
              <input
                value={orgSearch}
                onChange={(event) => setOrgSearch(event.target.value)}
                placeholder={tSidebar('organizationSwitcherSearch')}
                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none ring-[#242A40]/20 transition focus:bg-white focus:ring-2"
              />

              <div className="mt-3 max-h-64 space-y-1 overflow-auto pr-1">
                {filteredOrganizations.map((organization) => {
                  const isActive = organization.id === organizationId
                  return (
                    <button
                      key={organization.id}
                      type="button"
                      disabled={isSwitchingOrg || isActive}
                      onClick={() => handleOrganizationSwitch(organization.id)}
                      className={cn(
                        'w-full rounded-md border px-3 py-2 text-left transition-colors',
                        isActive
                          ? 'border-[#242A40]/20 bg-[#242A40]/10 text-[#242A40]'
                          : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50',
                        (isSwitchingOrg || isActive) && 'cursor-not-allowed opacity-80'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[14px] font-medium">{organization.name}</p>
                        {isActive && (
                          <span className="rounded-full bg-[#242A40]/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#242A40]">
                            {tSidebar('organizationSwitcherCurrent')}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{organization.slug}</p>
                    </button>
                  )
                })}
                {filteredOrganizations.length === 0 && (
                  <p className="px-2 py-2 text-sm text-slate-400">
                    {tSidebar('organizationSwitcherEmpty')}
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="truncate text-xs text-slate-500">
                  {currentOrganization?.name ?? tSidebar('organizationSwitcherNoSelection')}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsOrgPickerOpen(false)}
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    {tSidebar('organizationSwitcherClose')}
                  </button>
                  <button
                    type="button"
                    disabled={isSwitchingOrg}
                    onClick={handleOrganizationReset}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw size={12} />
                    {tSidebar('organizationSwitcherReset')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {canAccessTenantModules && (
        <div className="px-3 pb-2">
          <SidebarHoverTooltip
            enabled={collapsed && !isBotModeDropdownOpen}
            className={cn(collapsed ? 'flex justify-center' : 'w-full')}
            panelClassName="w-60"
            content={
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {tSidebar('botStatusLabel')}
                </p>
                <p className="text-[14px] font-semibold text-slate-900">
                  {currentBotModeOption.label}
                </p>
                <p className="text-xs leading-5 text-slate-600">
                  {currentBotModeOption.description}
                </p>
              </div>
            }
          >
            <DropdownMenu
              fullWidth={!collapsed}
              onOpenChange={(open) => {
                setIsBotModeDropdownOpen(isBotModeLoading ? false : open)
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isBotModeLoading}
                  title={collapsed ? undefined : `${tSidebar('botStatusLabel')}: ${botModeLabel}`}
                  aria-label={`${tSidebar('botStatusLabel')}: ${botModeLabel}`}
                  className={cn(
                    'group w-full rounded-xl border shadow-sm transition-colors duration-150 motion-reduce:transition-none',
                    currentBotModeToneClasses.surface,
                    isBotModeLoading && 'cursor-wait',
                    collapsed
                      ? 'mx-auto flex h-11 w-11 items-center justify-center p-0'
                      : 'flex items-center gap-2 px-3 py-2.5 text-left'
                  )}
                >
                  {collapsed ? (
                    <>
                      <span
                        className={cn(
                          'h-3 w-3 rounded-full',
                          currentBotModeToneClasses.dot,
                          !isBotModeLoading && effectiveBotMode === 'active' && 'animate-pulse'
                        )}
                      />
                      <span className="sr-only">{`${tSidebar('botStatusLabel')}: ${botModeLabel}`}</span>
                    </>
                  ) : (
                    <>
                      <span
                        className={cn(
                          'grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/60 bg-white/60',
                          currentBotModeToneClasses.badge
                        )}
                      >
                        <span
                          className={cn(
                            'h-2.5 w-2.5 rounded-full',
                            currentBotModeToneClasses.dot,
                            !isBotModeLoading && effectiveBotMode === 'active' && 'animate-pulse'
                          )}
                        />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">
                          {tSidebar('botStatusLabel')}
                        </p>
                        <p className="truncate text-[14px] font-semibold">{botModeLabel}</p>
                      </div>
                      <ChevronDown
                        className={cn(
                          'ml-auto h-4 w-4 shrink-0 opacity-65 transition-transform duration-200 ease-out motion-reduce:transition-none',
                          isBotModeDropdownOpen && 'rotate-180'
                        )}
                      />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="start"
                className={cn(
                  'z-[130] w-[304px] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl',
                  collapsed && 'ml-[-2px]'
                )}
              >
                <div className="border-b border-slate-100 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-semibold text-slate-900">
                      {tSidebar('botStatusQuickSwitchTitle')}
                    </p>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        currentBotModeToneClasses.badge
                      )}
                    >
                      <span
                        className={cn('h-1.5 w-1.5 rounded-full', currentBotModeToneClasses.dot)}
                      />
                      {botModeLabel}
                    </span>
                  </div>
                  {isUpdatingBotMode && (
                    <p className="mt-2 text-xs font-medium text-slate-600">
                      {tSidebar('botStatusQuickSwitchSaving')}
                    </p>
                  )}
                  {botModeUpdateError && (
                    <p className="mt-2 text-xs font-medium text-rose-600">{botModeUpdateError}</p>
                  )}
                </div>

                <div className="p-2">
                  {!canQuickSwitchBotMode && (
                    <div className="mb-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Lock size={14} className="shrink-0 text-violet-700" />
                        <p className="text-sm font-semibold leading-6 text-violet-950">
                          {botModeQuickSwitchHelperText}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {botModeOptions.map((option) => {
                      const isSelected = effectiveBotMode === option.value
                      const optionToneClasses =
                        botModeToneClassMap[resolveMainSidebarBotModeTone(option.value)]
                      const optionClassName = cn(
                        'rounded-xl border px-2.5 py-2 text-left',
                        !canQuickSwitchBotMode
                          ? isSelected
                            ? optionToneClasses.selected
                            : 'border-slate-200 bg-white'
                          : isSelected
                            ? optionToneClasses.selected
                            : cn('border-slate-200 bg-white', optionToneClasses.hover),
                        !canQuickSwitchBotMode && 'cursor-not-allowed opacity-80'
                      )
                      const optionContent = (
                        <div className="flex w-full items-start gap-2.5">
                          <span
                            className={cn(
                              'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full',
                              isSelected
                                ? optionToneClasses.selectedIcon
                                : 'bg-slate-100 text-slate-500'
                            )}
                          >
                            <span className={cn('h-2 w-2 rounded-full', optionToneClasses.dot)} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[14px] font-semibold text-slate-900">
                                {option.label}
                              </span>
                              {isSelected && (
                                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                  {tSidebar('botStatusCurrentLabel')}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                              {option.description}
                            </span>
                          </span>
                        </div>
                      )

                      if (!canQuickSwitchBotMode) {
                        return (
                          <div key={option.value} className={optionClassName}>
                            {optionContent}
                          </div>
                        )
                      }

                      return (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={() => handleQuickBotModeChange(option.value)}
                          className={cn(optionClassName, 'hover:bg-transparent')}
                        >
                          {optionContent}
                        </DropdownMenuItem>
                      )
                    })}
                  </div>

                  <DropdownMenuItem
                    asChild
                    className="mt-2 justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Link
                      href={settingsNavState.href ?? '/settings/ai'}
                      prefetch={false}
                      onMouseEnter={() =>
                        warmDashboardHotRoute(settingsNavState.href ?? '/settings/ai')
                      }
                      onFocus={() => warmDashboardHotRoute(settingsNavState.href ?? '/settings/ai')}
                      onClick={(event) =>
                        handleDashboardNavClick(event, settingsNavState.href ?? '/settings/ai')
                      }
                    >
                      {tSidebar('botStatusQuickSwitchOpenSettings')}
                    </Link>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarHoverTooltip>
        </div>
      )}

      <nav className="flex-1 px-3 pt-3">
        <div className={cn('space-y-4', !collapsed && 'space-y-5')}>
          {onboardingState?.showNavigationEntry &&
            (collapsed ? (
              <SidebarHoverTooltip
                className="flex justify-center"
                content={
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-900">{tNav('onboarding')}</p>
                    <p className="text-slate-600">{onboardingHighlightProgressLabel}</p>
                  </div>
                }
                immediate
              >
                <Link
                  href="/onboarding"
                  prefetch={false}
                  title={tNav('onboarding')}
                  aria-label={tNav('onboarding')}
                  className={cn(
                    'group flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-150 motion-reduce:transition-none',
                    isOnboardingActive
                      ? 'border-violet-300/70 bg-violet-400/25 text-violet-50 shadow-[0_12px_24px_-18px_rgba(139,92,246,0.9)]'
                      : 'border-violet-300/40 bg-violet-400/16 text-violet-100 hover:border-violet-200/80 hover:bg-violet-400/24'
                  )}
                  onMouseEnter={() => warmDashboardHotRoute('/onboarding')}
                  onFocus={() => warmDashboardHotRoute('/onboarding')}
                  onClick={(event) => handleDashboardNavClick(event, '/onboarding')}
                >
                  <HiOutlineRocketLaunch size={19} />
                </Link>
              </SidebarHoverTooltip>
            ) : (
                <Link
                  href="/onboarding"
                  prefetch={false}
                  aria-label={tNav('onboarding')}
                  className={cn(
                    'group flex items-center gap-3 rounded-2xl border px-3 py-3 transition-all duration-150 motion-reduce:transition-none',
                  isOnboardingActive
                    ? 'border-violet-300 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-white shadow-[0_18px_35px_-24px_rgba(139,92,246,0.95)]'
                    : 'border-violet-200/80 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-white hover:border-violet-300 hover:shadow-[0_18px_35px_-24px_rgba(139,92,246,0.7)]'
                )}
                onMouseEnter={() => warmDashboardHotRoute('/onboarding')}
                onFocus={() => warmDashboardHotRoute('/onboarding')}
                onClick={(event) => handleDashboardNavClick(event, '/onboarding')}
              >
                <HiMiniRocketLaunch
                  size={22}
                  className="shrink-0 text-violet-500"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-slate-900">
                    {tNav('onboarding')}
                  </p>
                  <p className="mt-1 truncate text-xs font-medium text-violet-900/80">
                    {onboardingHighlightProgressLabel}
                  </p>
                </div>
              </Link>
            ))}

          <div className={cn('space-y-5', !collapsed && 'space-y-6')}>
          {navigationSections.map((section) => {
            const sectionPanelId = `main-sidebar-section-${section.id}`
            const isSectionExpanded = collapsed ? true : expandedSections[section.id] !== false

            return (
              <section key={section.id} className="space-y-2.5">
                {collapsed ? (
                  <p className="sr-only">{section.label}</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSectionToggle(section.id)}
                    aria-expanded={isSectionExpanded}
                    aria-controls={sectionPanelId}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1 text-left transition-colors duration-150 hover:bg-white/70"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {section.label}
                    </span>
                    <ChevronDown
                      size={14}
                      className={cn(
                        'shrink-0 text-slate-400 transition-transform duration-200 motion-reduce:transition-none',
                        isSectionExpanded ? 'rotate-0' : '-rotate-90'
                      )}
                    />
                  </button>
                )}

                <div
                  id={sectionPanelId}
                  aria-hidden={!isSectionExpanded}
                  className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
                    collapsed ? 'overflow-visible' : 'overflow-hidden',
                    isSectionExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  )}
                >
                  <div className="min-h-0">
                    <div className={cn('space-y-1', collapsed ? 'space-y-2' : 'space-y-1.5')}>
                      {section.items.map((item) => {
                        const navState = resolveBillingLockedNavItem(
                          {
                            id: item.id,
                            href: item.href,
                          },
                          shouldRestrictToBilling
                        )
                        const itemHref = navState.href ?? item.href
                        const isLockedItem = navState.isLocked
                        const isSettingsItem = item.id === 'settings'
                        const isAdminRoot = item.id === 'admin-dashboard'
                        const isActive = isSettingsItem
                          ? activePath.startsWith('/settings')
                          : isAdminRoot
                            ? activePath === '/admin'
                            : activePath.startsWith(itemHref)
                        const Icon = isActive ? item.activeIcon : item.icon
                        const showUnread = item.id === 'inbox' && hasUnread
                        const showPending = item.id === 'settings' && hasPendingSuggestions
                        const showIndicator = showUnread || showPending
                        const itemLabel = isLockedItem
                          ? `${item.label} (${tSidebar('lockedLabel')})`
                          : item.label
                        const navItemClassName = cn(
                          'group flex items-center rounded-xl text-[14px] font-medium transition-colors duration-150 motion-reduce:transition-none',
                          collapsed
                            ? 'mx-auto h-10 w-10 justify-center gap-0'
                            : 'w-full gap-2.5 px-3 py-2 text-slate-600',
                          isActive
                            ? collapsed
                              ? 'bg-white/12 text-white'
                              : 'bg-slate-200/80 text-slate-900'
                            : isLockedItem
                              ? collapsed
                                ? 'cursor-not-allowed bg-white/5 text-white/30'
                                : 'cursor-not-allowed bg-slate-100/80 text-slate-400'
                              : collapsed
                                ? 'text-slate-300 hover:bg-white/8 hover:text-white'
                                : 'hover:bg-white hover:text-slate-900'
                        )
                        const iconClassName = cn(
                          'shrink-0',
                          isActive
                            ? collapsed
                              ? 'text-white'
                              : 'text-slate-800'
                            : isLockedItem
                              ? collapsed
                                ? 'text-white/30'
                                : 'text-slate-400'
                              : collapsed
                                ? 'text-slate-300 group-hover:text-white'
                                : 'text-slate-500 group-hover:text-slate-900'
                        )
                        const lockIconClassName = isActive
                          ? collapsed
                            ? 'text-white'
                            : 'text-slate-700'
                          : collapsed
                            ? 'text-white/45'
                            : 'text-slate-400'

                        const navItemContent = (
                          <>
                            <span className="relative flex items-center">
                              <Icon size={17} className={iconClassName} />
                              {showIndicator && collapsed && (
                                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-white ring-2 ring-[#202744]" />
                              )}
                              {isLockedItem && collapsed && (
                                <span className="absolute -bottom-1 -right-1 rounded-full border border-white/15 bg-[#1a2038] p-[1px]">
                                  <Lock size={8} className={lockIconClassName} />
                                </span>
                              )}
                            </span>
                            <span
                              className={cn(
                                'whitespace-nowrap leading-none transition-all duration-200 motion-reduce:transition-none',
                                collapsed
                                  ? 'w-0 translate-x-2 overflow-hidden opacity-0'
                                  : 'opacity-100'
                              )}
                            >
                              {item.label}
                            </span>
                            {isLockedItem && !collapsed && (
                              <span className="ml-auto inline-flex items-center rounded-full border border-slate-200 bg-white/80 p-1">
                                <Lock size={11} className={lockIconClassName} />
                              </span>
                            )}
                            {showIndicator && !collapsed && !isLockedItem && (
                              <span
                                className={cn(
                                  'ml-auto h-2 w-2 rounded-full ring-2',
                                  isActive
                                    ? 'bg-slate-700 ring-slate-200'
                                    : 'bg-[#242A40] ring-white'
                                )}
                              />
                            )}
                          </>
                        )
                        const collapsedNavTooltipContent = (
                          <div className="space-y-0.5">
                            <p className="font-semibold text-slate-900">{item.label}</p>
                            {isLockedItem && (
                              <p className="text-slate-600">{tSidebar('lockedLabel')}</p>
                            )}
                          </div>
                        )

                        if (isLockedItem) {
                          const lockedButton = (
                            <button
                              type="button"
                              disabled
                              title={collapsed ? undefined : itemLabel}
                              aria-label={itemLabel}
                              aria-disabled
                              className={navItemClassName}
                            >
                              {navItemContent}
                            </button>
                          )

                          if (collapsed) {
                            return (
                              <SidebarHoverTooltip
                                key={item.id}
                                className="flex justify-center"
                                content={collapsedNavTooltipContent}
                                immediate
                              >
                                {lockedButton}
                              </SidebarHoverTooltip>
                            )
                          }

                          return <div key={item.id}>{lockedButton}</div>
                        }

                        const navLink = (
                          <Link
                            href={itemHref}
                            prefetch={false}
                            title={collapsed ? undefined : item.label}
                            aria-label={item.label}
                            className={navItemClassName}
                            onMouseEnter={() => warmDashboardHotRoute(itemHref)}
                            onFocus={() => warmDashboardHotRoute(itemHref)}
                            onClick={(event) => handleDashboardNavClick(event, itemHref)}
                          >
                            {navItemContent}
                          </Link>
                        )

                        if (collapsed) {
                          return (
                            <SidebarHoverTooltip
                              key={item.id}
                              className="flex justify-center"
                              content={collapsedNavTooltipContent}
                              immediate
                            >
                              {navLink}
                            </SidebarHoverTooltip>
                          )
                        }

                        return <div key={item.id}>{navLink}</div>
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )
          })}
          </div>
        </div>
      </nav>

      {billingSnapshot && !collapsed && canAccessTenantModules && (
        <div className="px-3 pb-2">
          <div className="rounded-xl border border-slate-200 bg-white transition hover:border-slate-300">
            <Link
              href="/settings/plans"
              prefetch={false}
              className="block px-3 pt-3"
              onMouseEnter={() => warmDashboardHotRoute('/settings/plans')}
              onFocus={() => warmDashboardHotRoute('/settings/plans')}
              onClick={(event) => handleDashboardNavClick(event, '/settings/plans')}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {tSidebar('billingStatusLabel')}
                </p>
                <p className="text-xs font-semibold text-slate-700">{billingMembershipLabel}</p>
              </div>
              <p className="mt-1 text-base font-semibold text-slate-900">
                {formatSidebarBillingCredits(locale, billingDisplayCredits)}
                <span className="ml-1 text-xs font-medium text-slate-500">
                  {tSidebar('billingCreditsUnit')}
                </span>
              </p>
            </Link>

            <div className="px-3 pb-3">
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex flex-1 overflow-hidden rounded-full bg-slate-100">
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
                {canExpandBillingDetails && (
                  <button
                    type="button"
                    onClick={() => setIsBillingDetailsExpanded((prev) => !prev)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-expanded={isBillingDetailsExpanded}
                    aria-label={
                      isBillingDetailsExpanded
                        ? tSidebar('billingCollapseDetails')
                        : tSidebar('billingExpandDetails')
                    }
                  >
                    <ChevronDown
                      size={14}
                      className={cn(
                        'transition-transform duration-300 ease-out',
                        isBillingDetailsExpanded && 'rotate-180'
                      )}
                    />
                  </button>
                )}
              </div>
              {showLowCreditWarning && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                  <AlertCircle size={12} />
                  {tSidebar('billingLowCreditWarning')}
                </p>
              )}

              {canExpandBillingDetails ? (
                <div
                  className={cn(
                    'overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out',
                    isBillingDetailsExpanded ? 'mt-2 max-h-32 opacity-100' : 'max-h-0 opacity-0'
                  )}
                  aria-hidden={!isBillingDetailsExpanded}
                >
                  <div className="space-y-1 text-[11px] text-slate-600">
                    <p className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full bg-[#242A40]"
                        aria-hidden
                      />
                      {tSidebar('billingBreakdownPackage')}:{' '}
                      {formatSidebarBillingCredits(
                        locale,
                        billingSnapshot.package.credits.remaining
                      )}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full bg-purple-600"
                        aria-hidden
                      />
                      {tSidebar('billingBreakdownTopup')}:{' '}
                      {formatSidebarBillingCredits(locale, billingSnapshot.topupBalance)}
                    </p>
                    {billingPackageRenewalDetail && <p>{billingPackageRenewalDetail}</p>}
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-[11px] text-slate-500">{billingDetailPrimary}</p>
                  {billingDetailSecondary && (
                    <p className="mt-0.5 text-[11px] text-slate-500">{billingDetailSecondary}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {billingSnapshot && collapsed && canAccessTenantModules && (
        <div className="px-2 pb-2">
          <div className="relative group">
            <Link
              href="/settings/plans"
              prefetch={false}
              aria-label={tSidebar('billingUsageMenuLabel')}
              title={`${tSidebar('billingStatusLabel')}: ${formatSidebarBillingCredits(locale, billingDisplayCredits)} ${tSidebar('billingCreditsUnit')}`}
              onMouseEnter={() => warmDashboardHotRoute('/settings/plans')}
              onFocus={() => warmDashboardHotRoute('/settings/plans')}
              onClick={(event) => handleDashboardNavClick(event, '/settings/plans')}
              className={cn(
                'mx-auto flex h-11 w-11 items-center justify-center rounded-xl border transition',
                showLowCreditWarning
                  ? 'border-amber-300/70 bg-amber-400/10 hover:border-amber-200'
                  : 'border-white/10 bg-white/10 hover:border-white/15 hover:bg-white/14'
              )}
            >
              <div
                className="relative flex h-8 w-8 items-center justify-center rounded-full p-[2px]"
                style={{ background: collapsedBillingRingBackground }}
              >
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#18203A] text-[9px] font-semibold text-slate-100">
                  {formatSidebarBillingCompactCredits(locale, billingDisplayCredits)}
                </div>
              </div>
            </Link>

            <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 w-56 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700 shadow-lg opacity-0 invisible transition-all duration-150 group-hover:visible group-hover:opacity-100">
              <p className="font-semibold text-slate-900">{tSidebar('billingStatusLabel')}</p>
              <p className="mt-1 text-slate-600">{billingMembershipLabel}</p>
              <p className="mt-1 text-slate-600">
                {formatSidebarBillingCredits(locale, billingDisplayCredits)}{' '}
                {tSidebar('billingCreditsUnit')}
              </p>
              <p className="mt-1 text-slate-500">{billingDetailPrimary}</p>
              {billingDetailSecondary && (
                <p className="mt-1 text-slate-500">{billingDetailSecondary}</p>
              )}
              {billingSnapshot.membershipState === 'premium_active' && (
                <div className="mt-2 space-y-1 text-slate-600">
                  <p>
                    {tSidebar('billingBreakdownPackage')}:{' '}
                    {formatSidebarBillingCredits(locale, billingSnapshot.package.credits.remaining)}
                  </p>
                  <p>
                    {tSidebar('billingBreakdownTopup')}:{' '}
                    {formatSidebarBillingCredits(locale, billingSnapshot.topupBalance)}
                  </p>
                </div>
              )}
              {showLowCreditWarning && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  <AlertCircle size={10} />
                  {tSidebar('billingLowCreditWarning')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="px-3 pb-4">
        <div className="relative group">
          <button
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition',
              collapsed
                ? 'justify-center px-2 text-slate-200 hover:bg-white/10 hover:text-white'
                : 'hover:bg-white hover:text-slate-900'
            )}
            title={userName}
            type="button"
          >
            <Avatar
              name={userName || tCommon('defaultUserName')}
              src={userAvatarUrl}
              size="sm"
              className={cn(
                'border ring-1',
                collapsed ? 'border-white/10 ring-white/10' : 'border-white/80 ring-slate-200'
              )}
            />
            <div
              className={cn(
                'min-w-0 flex-1 transition-all duration-200 motion-reduce:transition-none',
                collapsed ? 'w-0 translate-x-2 overflow-hidden opacity-0' : 'opacity-100'
              )}
            >
              <p className="truncate text-[14px] font-semibold text-slate-900">
                {userName || tCommon('defaultUserName')}
              </p>
            </div>
          </button>

          <div className="absolute left-full bottom-0 ml-2 w-52 rounded-lg border border-gray-100 bg-white py-1 shadow-lg invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-all duration-200 motion-reduce:transition-none z-50">
            <div className="px-3 py-2 border-b border-gray-50">
              <p className="text-xs text-gray-500 truncate">{tCommon('loggedInAs')}</p>
              <p className="text-[14px] font-medium text-gray-900 truncate" title={userName}>
                {userName || tCommon('defaultUserName')}
              </p>
            </div>
            <div className="p-1">
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors flex items-center gap-2"
                >
                  <LogOut size={16} />
                  {tNav('signout')}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
