'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { AiBotMode, OrganizationBillingAccount } from '@/types/database'
import {
    buildOrganizationBillingSnapshot,
    type OrganizationBillingSnapshot
} from '@/lib/billing/snapshot'
import {
    HiMiniChatBubbleBottomCenterText,
    HiOutlineChatBubbleBottomCenterText,
    HiMiniUser,
    HiOutlineUser,
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
    ArrowLeftFromLine,
    ArrowRightFromLine,
    Building2,
    LayoutDashboard,
    LogOut,
    RotateCcw,
    Users,
    Wallet,
} from 'lucide-react'

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
            return
        }

        refreshUnread(organizationId)
        fetchBotMode(organizationId)
        refreshPendingSuggestions(organizationId)
        refreshBillingSnapshot(organizationId)
    }, [fetchBotMode, organizationId, refreshBillingSnapshot, refreshPendingSuggestions, refreshUnread])

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
            '/settings/general',
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
                        icon: LayoutDashboard,
                        activeIcon: LayoutDashboard,
                    },
                    {
                        id: 'admin-organizations',
                        href: '/admin/organizations',
                        label: tSidebar('adminOrganizations'),
                        icon: Building2,
                        activeIcon: Building2,
                    },
                    {
                        id: 'admin-billing',
                        href: '/admin/billing',
                        label: tSidebar('adminBilling'),
                        icon: Wallet,
                        activeIcon: Wallet,
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
                        icon: Users,
                        activeIcon: Users,
                    },
                ],
            }
        ]
    }, [isSystemAdmin, tSidebar])

    const footerSections = useMemo(
        () => [
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

    const toggleLabel = collapsed ? tCommon('expandSidebar') : tCommon('collapseSidebar')
    const botModeLabel = useMemo(() => {
        if (botMode === 'shadow') return tSidebar('botStatusShadow')
        if (botMode === 'off') return tSidebar('botStatusOff')
        return tSidebar('botStatusActive')
    }, [botMode, tSidebar])
    const botModeDot = botMode === 'shadow'
        ? 'bg-amber-500'
        : botMode === 'off'
            ? 'bg-red-500'
            : 'bg-emerald-500'
    const canAccessTenantModules = !isSystemAdmin || Boolean(organizationId)
    const navigationSections = canAccessTenantModules ? [...sections, ...adminSections] : adminSections
    const visibleFooterSections = canAccessTenantModules ? footerSections : []
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
    const billingProgress = useMemo(() => {
        if (!billingSnapshot) return 0

        if (billingSnapshot.membershipState === 'trial_active' || billingSnapshot.membershipState === 'trial_exhausted') {
            return Math.max(
                billingSnapshot.trial.credits.progress,
                billingSnapshot.trial.timeProgress
            )
        }

        if (billingSnapshot.membershipState === 'premium_active') {
            if (billingSnapshot.package.credits.remaining <= 0 && billingSnapshot.topupBalance > 0) {
                return 100
            }
            return billingSnapshot.package.credits.progress
        }

        return 0
    }, [billingSnapshot])
    const billingSubline = useMemo(() => {
        if (!billingSnapshot) return tSidebar('billingUnavailableDescription')

        if (billingSnapshot.membershipState === 'trial_active' || billingSnapshot.membershipState === 'trial_exhausted') {
            return tSidebar('billingTrialSublineDetailed', {
                days: String(billingSnapshot.trial.remainingDays),
                credits: formatCredits(billingSnapshot.trial.credits.remaining)
            })
        }

        if (billingSnapshot.membershipState === 'premium_active'
            && billingSnapshot.package.credits.remaining <= 0
            && billingSnapshot.topupBalance > 0
        ) {
            return tSidebar('billingTopupSubline', {
                credits: formatCredits(billingSnapshot.topupBalance)
            })
        }

        if (billingSnapshot.package.periodEnd) {
            try {
                const resetDate = new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric'
                }).format(new Date(billingSnapshot.package.periodEnd))
                return tSidebar('billingPackageSublineWithDate', { date: resetDate })
            } catch {
                return tSidebar('billingPackageSubline')
            }
        }

        return tSidebar('billingPackageSubline')
    }, [billingSnapshot, tSidebar])

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
                        href="/settings/ai"
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
                                    const isSettingsItem = item.id === 'settings'
                                    const isAdminRoot = item.id === 'admin-dashboard'
                                    const isActive = isSettingsItem
                                        ? pathWithoutLocale.startsWith('/settings')
                                        : isAdminRoot
                                            ? pathWithoutLocale === '/admin'
                                            : pathWithoutLocale.startsWith(item.href)
                                    const Icon = isActive ? item.activeIcon : item.icon
                                    const showUnread = item.id === 'inbox' && hasUnread
                                    return (
                                        <Link
                                            key={item.id}
                                            href={item.href}
                                            title={item.label}
                                            aria-label={item.label}
                                            className={cn(
                                                'group flex items-center rounded-xl text-sm font-medium transition-colors duration-150 motion-reduce:transition-none',
                                                collapsed
                                                    ? 'mx-auto h-11 w-11 justify-center gap-0'
                                                    : 'w-full gap-3 px-3 py-2',
                                                isActive
                                                    ? 'bg-[#242A40] text-white shadow-sm'
                                                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                            )}
                                        >
                                            <span className="relative flex items-center">
                                                <Icon
                                                    size={18}
                                                    className={cn(
                                                        'shrink-0',
                                                        isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-900'
                                                    )}
                                                />
                                                {showUnread && collapsed && (
                                                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#242A40] ring-2 ring-slate-50" />
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
                                            {showUnread && !collapsed && (
                                                <span
                                                    className={cn(
                                                        'ml-auto h-2 w-2 rounded-full ring-2',
                                                        isActive ? 'bg-white ring-[#242A40]/25' : 'bg-[#242A40] ring-white'
                                                    )}
                                                />
                                            )}
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </nav>

            {visibleFooterSections.length > 0 && (
                <div className="px-3 pb-3">
                    <div className="space-y-2">
                        {visibleFooterSections.map(section => (
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
                                        const isActive = pathWithoutLocale.startsWith('/settings')
                                        const Icon = isActive ? item.activeIcon : item.icon
                                        const showPending = item.id === 'settings' && hasPendingSuggestions
                                        return (
                                            <Link
                                                key={item.id}
                                                href={item.href}
                                                title={item.label}
                                                aria-label={item.label}
                                                className={cn(
                                                    'group flex items-center rounded-xl text-sm font-medium transition-colors duration-150 motion-reduce:transition-none',
                                                    collapsed
                                                        ? 'mx-auto h-11 w-11 justify-center gap-0'
                                                        : 'w-full gap-3 px-3 py-2',
                                                    isActive
                                                        ? 'bg-[#242A40] text-white shadow-sm'
                                                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                                )}
                                            >
                                                <span className="relative flex items-center">
                                                    <Icon
                                                        size={18}
                                                        className={cn(
                                                            'shrink-0',
                                                            isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-900'
                                                        )}
                                                    />
                                                    {showPending && collapsed && (
                                                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#242A40] ring-2 ring-slate-50" />
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
                                                {showPending && !collapsed && (
                                                    <span
                                                        className={cn(
                                                            'ml-auto h-2 w-2 rounded-full ring-2',
                                                            isActive ? 'bg-white ring-[#242A40]/25' : 'bg-[#242A40] ring-white'
                                                        )}
                                                    />
                                                )}
                                            </Link>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {billingSnapshot && !collapsed && canAccessTenantModules && (
                <div className="px-3 pb-2">
                    <Link
                        href="/settings/plans"
                        className="block rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {tSidebar('billingStatusLabel')}
                            </p>
                            <p className="text-xs font-semibold text-slate-700">{billingMembershipLabel}</p>
                        </div>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                            {formatCredits(billingSnapshot.totalRemainingCredits)}
                            <span className="ml-1 text-xs font-medium text-slate-500">{tSidebar('billingCreditsUnit')}</span>
                        </p>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                            <div
                                className="h-1.5 rounded-full bg-[#242A40]"
                                style={{ width: `${Math.min(100, billingProgress)}%` }}
                            />
                        </div>
                        <p className="mt-2 text-[11px] text-slate-500">{billingSubline}</p>
                    </Link>
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
