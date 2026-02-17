'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { AiBotMode, OrganizationBillingAccount } from '@/types/database'
import { shouldEnableManualRoutePrefetch } from '@/design/manual-prefetch'
import {
    buildOrganizationBillingSnapshot,
    type OrganizationBillingSnapshot
} from '@/lib/billing/snapshot'
import { buildBillingRefreshSignal } from '@/lib/billing/refresh-signal'
import {
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
    HiMiniCog6Tooth,
    HiOutlineCog6Tooth,
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
    isLowCreditWarningVisible
} from '@/lib/billing/sidebar-progress'
import { resolveWorkspaceAccessState } from '@/lib/billing/workspace-access'
import { resolveBillingLockedNavItem } from '@/lib/billing/navigation-lock'
import { resolveMainSidebarBotMode } from '@/design/main-sidebar-bot-mode'

const STORAGE_KEY = 'leadqualifier.sidebarCollapsed'

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
    return [...organizations].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
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

function formatCredits(value: number) {
    const safe = Math.max(0, Number.isFinite(value) ? value : 0)
    return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format(safe)
}

function formatCompactCredits(value: number) {
    const safe = Math.max(0, Number.isFinite(value) ? value : 0)
    return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: safe >= 10000 ? 0 : 1
    }).format(safe)
}

interface MainSidebarProps {
    userName?: string
    isSystemAdmin?: boolean
    organizations?: ActiveOrganizationSummary[]
    activeOrganizationId?: string | null
    readOnlyTenantMode?: boolean
}

export function MainSidebar({
    userName,
    isSystemAdmin = false,
    organizations = [],
    activeOrganizationId = null,
    readOnlyTenantMode = false
}: MainSidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}\//, '/')
    const tNav = useTranslations('nav')
    const tCommon = useTranslations('common')
    const tSidebar = useTranslations('mainSidebar')

    const [collapsed, setCollapsed] = useState(false)
    const [hasUnread, setHasUnread] = useState(false)
    const [hasPendingSuggestions, setHasPendingSuggestions] = useState(false)
    const [organizationId, setOrganizationId] = useState<string | null>(activeOrganizationId)
    const [organizationOptions, setOrganizationOptions] = useState<ActiveOrganizationSummary[]>(sortOrganizations(organizations))
    const [isLoadingOrganizationOptions, setIsLoadingOrganizationOptions] = useState(false)
    const [hasLoadedOrganizationOptions, setHasLoadedOrganizationOptions] = useState(!isSystemAdmin)
    const [botMode, setBotMode] = useState<AiBotMode>('active')
    const [billingSnapshot, setBillingSnapshot] = useState<OrganizationBillingSnapshot | null>(null)
    const [isBillingDetailsExpanded, setIsBillingDetailsExpanded] = useState(false)
    const [orgSearch, setOrgSearch] = useState('')
    const [isSwitchingOrg, setIsSwitchingOrg] = useState(false)
    const [isOrgPickerOpen, setIsOrgPickerOpen] = useState(false)
    const localePrefixMatch = pathname.match(/^\/([a-z]{2})(\/|$)/)
    const localePrefix = localePrefixMatch && localePrefixMatch[1] !== 'tr'
        ? `/${localePrefixMatch[1]}`
        : ''

    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
    if (!supabaseRef.current) {
        supabaseRef.current = createClient()
    }
    const supabase = supabaseRef.current

    const currentOrganization = useMemo(
        () => organizationOptions.find((organization) => organization.id === organizationId)
            ?? organizations.find((organization) => organization.id === organizationId)
            ?? null,
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
        () => buildBillingRefreshSignal(searchParams),
        [searchParams]
    )

    const loadOrganizationOptions = useCallback(async () => {
        if (!isSystemAdmin || hasLoadedOrganizationOptions || isLoadingOrganizationOptions) {
            return
        }

        setIsLoadingOrganizationOptions(true)
        try {
            const response = await fetch('/api/organizations/active', {
                method: 'GET',
                cache: 'no-store'
            })

            if (!response.ok) {
                throw new Error('Failed to load organization options')
            }

            const payload = await response.json() as { organizations?: unknown[] }
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

    const refreshUnread = useCallback(async (orgId: string) => {
        const { count, error } = await supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .gt('unread_count', 0)

        if (error) {
            console.error('Failed to load unread indicator', error)
            return
        }

        setHasUnread((count ?? 0) > 0)
    }, [supabase])

    const refreshPendingSuggestions = useCallback(async (orgId: string) => {
        const { count, error } = await supabase
            .from('offering_profile_suggestions')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .is('archived_at', null)
            .or('status.eq.pending,status.is.null')

        if (error) {
            console.error('Failed to load pending suggestion indicator', error)
            return
        }

        setHasPendingSuggestions((count ?? 0) > 0)
    }, [supabase])

    const fetchBotMode = useCallback(async (orgId: string) => {
        const { data, error } = await supabase
            .from('organization_ai_settings')
            .select('bot_mode')
            .eq('organization_id', orgId)
            .maybeSingle()

        if (error) {
            console.error('Failed to load bot mode', error)
            return
        }

        const mode = data?.bot_mode
        if (mode === 'active' || mode === 'shadow' || mode === 'off') {
            setBotMode(mode)
        } else {
            setBotMode('active')
        }
    }, [supabase])

    const refreshBillingSnapshot = useCallback(async (orgId: string) => {
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
    }, [supabase])

    const handleOrganizationSwitch = useCallback(async (nextOrganizationId: string) => {
        if (!isSystemAdmin || isSwitchingOrg || !nextOrganizationId || nextOrganizationId === organizationId) {
            return
        }

        setIsSwitchingOrg(true)
        try {
            const response = await fetch('/api/organizations/active', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ organizationId: nextOrganizationId })
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
    }, [isSystemAdmin, isSwitchingOrg, organizationId, router])

    const handleOrganizationReset = useCallback(async () => {
        if (!isSystemAdmin || isSwitchingOrg) return

        setIsSwitchingOrg(true)
        try {
            const response = await fetch('/api/organizations/active', {
                method: 'DELETE'
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
            const stored = localStorage.getItem(STORAGE_KEY)
            setCollapsed(stored === 'true')
        } catch {
            setCollapsed(false)
        }
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false')
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
        if (!organizationId) {
            setHasUnread(false)
            setHasPendingSuggestions(false)
            setBotMode('active')
            setBillingSnapshot(null)
            setIsBillingDetailsExpanded(false)
            return
        }

        refreshUnread(organizationId)
        fetchBotMode(organizationId)
        refreshPendingSuggestions(organizationId)
        refreshBillingSnapshot(organizationId)
    }, [fetchBotMode, organizationId, refreshBillingSnapshot, refreshPendingSuggestions, refreshUnread])

    useEffect(() => {
        if (!organizationId) return
        if (!billingRefreshSignal) return
        refreshBillingSnapshot(organizationId)
    }, [billingRefreshSignal, organizationId, refreshBillingSnapshot])

    useEffect(() => {
        if (billingSnapshot?.membershipState !== 'premium_active') {
            setIsBillingDetailsExpanded(false)
        }
    }, [billingSnapshot?.membershipState])

    useEffect(() => {
        if (!organizationId) return
        let unreadChannel: ReturnType<typeof supabase.channel> | null = null
        let suggestionChannel: ReturnType<typeof supabase.channel> | null = null
        let billingChannel: ReturnType<typeof supabase.channel> | null = null
        let isMounted = true

        const setupRealtime = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!isMounted) return

            if (session?.access_token) {
                supabase.realtime.setAuth(session.access_token)
            }

            unreadChannel = supabase.channel(`sidebar_unread_${organizationId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'conversations',
                    filter: `organization_id=eq.${organizationId}`
                }, () => {
                    refreshUnread(organizationId)
                })
                .subscribe()

            suggestionChannel = supabase.channel(`sidebar_suggestions_${organizationId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'offering_profile_suggestions',
                    filter: `organization_id=eq.${organizationId}`
                }, () => {
                    refreshPendingSuggestions(organizationId)
                })
                .subscribe()

            billingChannel = supabase.channel(`sidebar_billing_${organizationId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'organization_billing_accounts',
                    filter: `organization_id=eq.${organizationId}`
                }, () => {
                    refreshBillingSnapshot(organizationId)
                })
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'organization_credit_ledger',
                    filter: `organization_id=eq.${organizationId}`
                }, () => {
                    refreshBillingSnapshot(organizationId)
                })
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
    }, [organizationId, refreshBillingSnapshot, refreshPendingSuggestions, refreshUnread, supabase])

    useEffect(() => {
        if (!organizationId) return
        const handler = () => fetchBotMode(organizationId)
        window.addEventListener('ai-settings-updated', handler)
        return () => window.removeEventListener('ai-settings-updated', handler)
    }, [fetchBotMode, organizationId])

    useEffect(() => {
        if (!organizationId) return
        const handler = () => refreshPendingSuggestions(organizationId)
        window.addEventListener('pending-suggestions-updated', handler)
        return () => window.removeEventListener('pending-suggestions-updated', handler)
    }, [organizationId, refreshPendingSuggestions])

    useEffect(() => {
        if (!shouldEnableManualRoutePrefetch()) return

        const routesToPrefetch = [
            '/inbox',
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
            '/settings/billing'
        ]

        if (isSystemAdmin) {
            routesToPrefetch.push('/admin', '/admin/billing', '/admin/organizations', '/admin/leads', '/admin/users')
        }

        const uniqueRoutes = Array.from(new Set(routesToPrefetch))
        const prefetchRoutes = () => {
            uniqueRoutes.forEach((route) => {
                router.prefetch(`${localePrefix}${route}`)
            })
        }

        const timeoutId = setTimeout(prefetchRoutes, 250)
        return () => clearTimeout(timeoutId)
    }, [isSystemAdmin, localePrefix, router])

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

        return [
            {
                id: 'admin',
                label: tSidebar('adminSection'),
                items: [
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
                ],
            }
        ]
    }, [isSystemAdmin, tSidebar])

    const toggleLabel = collapsed ? tCommon('expandSidebar') : tCommon('collapseSidebar')
    const workspaceAccess = useMemo(
        () => resolveWorkspaceAccessState(billingSnapshot),
        [billingSnapshot]
    )
    const shouldRestrictToBilling = workspaceAccess.isLocked && !isSystemAdmin
    const effectiveBotMode = resolveMainSidebarBotMode({
        botMode,
        isWorkspaceLocked: shouldRestrictToBilling
    })
    const botModeLabel = useMemo(() => {
        if (effectiveBotMode === 'shadow') return tSidebar('botStatusShadow')
        if (effectiveBotMode === 'off') return tSidebar('botStatusOff')
        return tSidebar('botStatusActive')
    }, [effectiveBotMode, tSidebar])
    const botModeDot = effectiveBotMode === 'shadow'
        ? 'bg-amber-500'
        : effectiveBotMode === 'off'
            ? 'bg-red-500'
            : 'bg-emerald-500'
    const canAccessTenantModules = !isSystemAdmin || Boolean(organizationId)
    const settingsNavState = resolveBillingLockedNavItem(
        {
            id: 'settings',
            href: '/settings/ai'
        },
        shouldRestrictToBilling
    )
    const navigationSections = canAccessTenantModules
        ? [...sections, ...adminSections]
        : adminSections
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

        if (billingSnapshot.membershipState === 'trial_active' || billingSnapshot.membershipState === 'trial_exhausted') {
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
                topupPercent: 0
            }
        }

        return calculateSidebarBillingProgressSegments({
            membershipState: billingSnapshot.membershipState,
            trialRemainingCredits: billingSnapshot.trial.credits.remaining,
            trialCreditLimit: billingSnapshot.trial.credits.limit,
            packageRemainingCredits: billingSnapshot.package.credits.remaining,
            packageCreditLimit: billingSnapshot.package.credits.limit,
            topupBalance: billingSnapshot.topupBalance
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
            topupBalance: billingSnapshot.topupBalance
        })
    }, [billingSnapshot])
    const billingDetailPrimary = useMemo(() => {
        if (!billingSnapshot) return tSidebar('billingUnavailableDescription')

        if (billingSnapshot.membershipState === 'trial_active') {
            return tSidebar('billingTrialSubline', {
                days: String(billingSnapshot.trial.remainingDays)
            })
        }

        if (billingSnapshot.membershipState === 'trial_exhausted') {
            return tSidebar('billingUpgradePromptSubline')
        }

        if (billingSnapshot.membershipState === 'premium_active') {
            return tSidebar('billingPackageCreditsSubline', {
                credits: formatCredits(billingSnapshot.package.credits.remaining)
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
    }, [billingSnapshot, tSidebar])
    const billingDetailSecondary = useMemo(() => {
        if (!billingSnapshot) return null

        if (billingSnapshot.membershipState === 'trial_active') {
            return tSidebar('billingTrialCreditsSubline', {
                credits: formatCredits(billingSnapshot.trial.credits.remaining)
            })
        }

        if (billingSnapshot.membershipState !== 'premium_active') {
            return null
        }

        if (billingSnapshot.topupBalance > 0) {
            return tSidebar('billingTopupSubline', {
                credits: formatCredits(billingSnapshot.topupBalance)
            })
        }

        if (!billingSnapshot.package.periodEnd) {
            return tSidebar('billingPackageSubline')
        }

        try {
            const resetDate = new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric'
            }).format(new Date(billingSnapshot.package.periodEnd))
            return tSidebar('billingPackageSublineWithDate', { date: resetDate })
        } catch {
            return tSidebar('billingPackageSubline')
        }
    }, [billingSnapshot, tSidebar])
    const billingPackageRenewalDetail = useMemo(() => {
        if (!billingSnapshot || billingSnapshot.membershipState !== 'premium_active') return null

        if (!billingSnapshot.package.periodEnd) {
            return tSidebar('billingPackageRenewalUnknown')
        }

        try {
            const renewalDate = new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric'
            }).format(new Date(billingSnapshot.package.periodEnd))
            return tSidebar('billingPackageRenewalDate', { date: renewalDate })
        } catch {
            return tSidebar('billingPackageRenewalUnknown')
        }
    }, [billingSnapshot, tSidebar])
    const canExpandBillingDetails = billingSnapshot?.membershipState === 'premium_active'

    return (
        <aside
            className={cn(
                'relative flex h-screen shrink-0 flex-col border-r border-slate-200/80 bg-slate-50/70 text-slate-900 transition-[width] duration-200 motion-reduce:transition-none',
                collapsed ? 'w-[76px]' : 'w-[264px]'
            )}
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
                        className={cn(
                            'flex items-center',
                            collapsed ? 'w-full justify-center gap-0' : 'gap-3'
                        )}
                    >
                        <div
                            className={cn(
                                'transition-all duration-200 motion-reduce:transition-none',
                                collapsed ? 'w-11 opacity-100' : 'w-[85px] opacity-100'
                            )}
                        >
                            <Image
                                src={collapsed ? '/icon-black.svg' : '/logo-black.svg'}
                                alt={tCommon('appName')}
                                width={collapsed ? 44 : 85}
                                height={collapsed ? 44 : 27}
                                priority
                                className="h-auto w-full"
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCollapsed(prev => !prev)}
                        className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-900 hover:ring-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#242A40]/20',
                            'motion-reduce:transition-none'
                        )}
                        aria-label={toggleLabel}
                        aria-expanded={!collapsed}
                        title={toggleLabel}
                    >
                        {collapsed ? <ArrowRightFromLine size={16} /> : <ArrowLeftFromLine size={16} />}
                    </button>
                </div>
            </div>

            {isSystemAdmin && (
                <div className={cn('px-3 pb-2 space-y-2', collapsed && 'px-2')}>
                    {collapsed ? (
                        <button
                            type="button"
                            onClick={() => setIsOrgPickerOpen(true)}
                            title={currentOrganization?.name ?? tSidebar('organizationSwitcherNoSelection')}
                            className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                        >
                            <Building2 size={15} />
                        </button>
                    ) : (
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {tSidebar('organizationSwitcherTitle')}
                            </p>
                            <p className="mt-2 truncate text-sm font-semibold text-slate-900">
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
                                    <p className="text-sm font-semibold text-slate-900">
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
                                                <p className="truncate text-sm font-medium">{organization.name}</p>
                                                {isActive && (
                                                    <span className="rounded-full bg-[#242A40]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#242A40]">
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
                    <Link
                        href={settingsNavState.href ?? '/settings/ai'}
                        title={`${tSidebar('botStatusLabel')}: ${botModeLabel}`}
                        aria-label={`${tSidebar('botStatusLabel')}: ${botModeLabel}`}
                        className={cn(
                            'group flex items-center rounded-xl text-xs font-medium text-slate-600 transition-colors duration-150 motion-reduce:transition-none hover:bg-white hover:text-slate-900',
                            collapsed ? 'mx-auto h-9 w-9 justify-center' : 'w-full gap-2 px-3 py-2'
                        )}
                    >
                        <span className={cn('h-2.5 w-2.5 rounded-full', botModeDot)} />
                        {collapsed ? (
                            <span className="sr-only">{`${tSidebar('botStatusLabel')}: ${botModeLabel}`}</span>
                        ) : (
                            <>
                                <span className="text-xs text-slate-500">{tSidebar('botStatusLabel')}</span>
                                <span className="ml-auto text-xs font-semibold text-slate-900">{botModeLabel}</span>
                            </>
                        )}
                    </Link>
                </div>
            )}

            <nav className="flex-1 px-3 pt-3">
                <div className="space-y-4">
                    {navigationSections.map(section => (
                        <div key={section.id} className="space-y-2">
                            <p
                                className={cn(
                                    'px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400',
                                    collapsed && 'sr-only'
                                )}
                            >
                                {section.label}
                            </p>
                            <div className="space-y-1">
                                {section.items.map(item => {
                                    const navState = resolveBillingLockedNavItem(
                                        {
                                            id: item.id,
                                            href: item.href
                                        },
                                        shouldRestrictToBilling
                                    )
                                    const itemHref = navState.href ?? item.href
                                    const isLockedItem = navState.isLocked
                                    const isSettingsItem = item.id === 'settings'
                                    const isAdminRoot = item.id === 'admin-dashboard'
                                    const isActive = isSettingsItem
                                        ? pathWithoutLocale.startsWith('/settings')
                                        : isAdminRoot
                                            ? pathWithoutLocale === '/admin'
                                            : pathWithoutLocale.startsWith(itemHref)
                                    const Icon = isActive ? item.activeIcon : item.icon
                                    const showUnread = item.id === 'inbox' && hasUnread
                                    const showPending = item.id === 'settings' && hasPendingSuggestions
                                    const showIndicator = showUnread || showPending
                                    const itemLabel = isLockedItem
                                        ? `${item.label} (${tSidebar('lockedLabel')})`
                                        : item.label
                                    const navItemClassName = cn(
                                        'group flex items-center rounded-xl text-sm font-medium transition-colors duration-150 motion-reduce:transition-none',
                                        collapsed
                                            ? 'mx-auto h-11 w-11 justify-center gap-0'
                                            : 'w-full gap-3 px-3 py-2',
                                        isActive
                                            ? 'bg-[#242A40] text-white shadow-sm'
                                            : isLockedItem
                                                ? 'cursor-not-allowed bg-slate-100/80 text-slate-400'
                                                : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                    )
                                    const iconClassName = cn(
                                        'shrink-0',
                                        isActive
                                            ? 'text-white'
                                            : isLockedItem
                                                ? 'text-slate-400'
                                                : 'text-slate-500 group-hover:text-slate-900'
                                    )
                                    const lockIconClassName = isActive ? 'text-white/90' : 'text-slate-400'

                                    const navItemContent = (
                                        <>
                                            <span className="relative flex items-center">
                                                <Icon
                                                    size={18}
                                                    className={iconClassName}
                                                />
                                                {showIndicator && collapsed && (
                                                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#242A40] ring-2 ring-slate-50" />
                                                )}
                                                {isLockedItem && collapsed && (
                                                    <span className="absolute -bottom-1 -right-1 rounded-full border border-slate-200 bg-white p-[1px]">
                                                        <Lock size={8} className={lockIconClassName} />
                                                    </span>
                                                )}
                                            </span>
                                            <span
                                                className={cn(
                                                    'whitespace-nowrap transition-all duration-200 motion-reduce:transition-none',
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
                                                        isActive ? 'bg-white ring-[#242A40]/25' : 'bg-[#242A40] ring-white'
                                                    )}
                                                />
                                            )}
                                        </>
                                    )

                                    if (isLockedItem) {
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                disabled
                                                title={itemLabel}
                                                aria-label={itemLabel}
                                                aria-disabled
                                                className={navItemClassName}
                                            >
                                                {navItemContent}
                                            </button>
                                        )
                                    }

                                    return (
                                        <Link
                                            key={item.id}
                                            href={itemHref}
                                            title={item.label}
                                            aria-label={item.label}
                                            className={navItemClassName}
                                        >
                                            {navItemContent}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </nav>

            {billingSnapshot && !collapsed && canAccessTenantModules && (
                <div className="px-3 pb-2">
                    <div className="rounded-xl border border-slate-200 bg-white transition hover:border-slate-300">
                        <Link href="/settings/plans" className="block px-3 pt-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                    {tSidebar('billingStatusLabel')}
                                </p>
                                <p className="text-xs font-semibold text-slate-700">{billingMembershipLabel}</p>
                            </div>
                            <p className="mt-1 text-base font-semibold text-slate-900">
                                {formatCredits(billingDisplayCredits)}
                                <span className="ml-1 text-xs font-medium text-slate-500">{tSidebar('billingCreditsUnit')}</span>
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
                                        aria-label={isBillingDetailsExpanded
                                            ? tSidebar('billingCollapseDetails')
                                            : tSidebar('billingExpandDetails')}
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
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#242A40]" aria-hidden />
                                            {tSidebar('billingBreakdownPackage')}: {formatCredits(billingSnapshot.package.credits.remaining)}
                                        </p>
                                        <p className="flex items-center gap-1.5">
                                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-600" aria-hidden />
                                            {tSidebar('billingBreakdownTopup')}: {formatCredits(billingSnapshot.topupBalance)}
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
                            aria-label={tSidebar('billingUsageMenuLabel')}
                            title={`${tSidebar('billingStatusLabel')}: ${formatCredits(billingDisplayCredits)} ${tSidebar('billingCreditsUnit')}`}
                            className={cn(
                                'mx-auto flex h-11 w-11 items-center justify-center rounded-xl border bg-white shadow-sm transition hover:border-slate-300',
                                showLowCreditWarning ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                            )}
                        >
                            <div
                                className="relative flex h-8 w-8 items-center justify-center rounded-full p-[2px]"
                                style={{ background: collapsedBillingRingBackground }}
                            >
                                <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-[9px] font-semibold text-slate-700">
                                    {formatCompactCredits(billingDisplayCredits)}
                                </div>
                            </div>
                        </Link>

                        <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 w-56 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700 shadow-lg opacity-0 invisible transition-all duration-150 group-hover:visible group-hover:opacity-100">
                            <p className="font-semibold text-slate-900">{tSidebar('billingStatusLabel')}</p>
                            <p className="mt-1 text-slate-600">{billingMembershipLabel}</p>
                            <p className="mt-1 text-slate-600">
                                {formatCredits(billingDisplayCredits)} {tSidebar('billingCreditsUnit')}
                            </p>
                            <p className="mt-1 text-slate-500">{billingDetailPrimary}</p>
                            {billingDetailSecondary && (
                                <p className="mt-1 text-slate-500">{billingDetailSecondary}</p>
                            )}
                            {billingSnapshot.membershipState === 'premium_active' && (
                                <div className="mt-2 space-y-1 text-slate-600">
                                    <p>{tSidebar('billingBreakdownPackage')}: {formatCredits(billingSnapshot.package.credits.remaining)}</p>
                                    <p>{tSidebar('billingBreakdownTopup')}: {formatCredits(billingSnapshot.topupBalance)}</p>
                                </div>
                            )}
                            {showLowCreditWarning && (
                                <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
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
                            'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white hover:text-slate-900',
                            collapsed && 'justify-center px-2'
                        )}
                        title={userName}
                        type="button"
                    >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                            {(userName?.[0] || tCommon('defaultUserInitial')).toUpperCase()}
                        </div>
                        <div
                            className={cn(
                                'min-w-0 flex-1 transition-all duration-200 motion-reduce:transition-none',
                                collapsed ? 'w-0 translate-x-2 overflow-hidden opacity-0' : 'opacity-100'
                            )}
                        >
                            <p className="truncate text-sm font-semibold text-slate-900">
                                {userName || tCommon('defaultUserName')}
                            </p>
                        </div>
                    </button>

                    <div className="absolute left-full bottom-0 ml-2 w-52 rounded-lg border border-gray-100 bg-white py-1 shadow-lg invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-all duration-200 motion-reduce:transition-none z-50">
                        <div className="px-3 py-2 border-b border-gray-50">
                            <p className="text-xs text-gray-500 truncate">{tCommon('loggedInAs')}</p>
                            <p className="text-sm font-medium text-gray-900 truncate" title={userName}>
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
