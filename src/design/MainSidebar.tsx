'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { AiBotMode } from '@/types/database'
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
} from 'lucide-react'

const STORAGE_KEY = 'leadqualifier.sidebarCollapsed'

interface ActiveOrganizationSummary {
    id: string
    name: string
    slug: string
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
    const [botMode, setBotMode] = useState<AiBotMode>('active')
    const [orgSearch, setOrgSearch] = useState('')
    const [isSwitchingOrg, setIsSwitchingOrg] = useState(false)

    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
    if (!supabaseRef.current) {
        supabaseRef.current = createClient()
    }
    const supabase = supabaseRef.current

    const currentOrganization = useMemo(
        () => organizations.find((organization) => organization.id === organizationId) ?? null,
        [organizationId, organizations]
    )

    const filteredOrganizations = useMemo(() => {
        const query = orgSearch.trim().toLowerCase()
        if (!query) return organizations
        return organizations.filter((organization) => {
            return (
                organization.name.toLowerCase().includes(query) ||
                organization.slug.toLowerCase().includes(query)
            )
        })
    }, [orgSearch, organizations])

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

            setOrganizationId(organizations[0]?.id ?? null)
            setOrgSearch('')
            router.refresh()
        } catch (error) {
            console.error(error)
        } finally {
            setIsSwitchingOrg(false)
        }
    }, [isSwitchingOrg, isSystemAdmin, organizations, router])

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
        if (!organizationId) {
            setHasUnread(false)
            setHasPendingSuggestions(false)
            setBotMode('active')
            return
        }

        refreshUnread(organizationId)
        fetchBotMode(organizationId)
        refreshPendingSuggestions(organizationId)
    }, [fetchBotMode, organizationId, refreshPendingSuggestions, refreshUnread])

    useEffect(() => {
        if (!organizationId) return
        let unreadChannel: ReturnType<typeof supabase.channel> | null = null
        let suggestionChannel: ReturnType<typeof supabase.channel> | null = null
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
        }
    }, [organizationId, refreshPendingSuggestions, refreshUnread, supabase])

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
                        href: '/settings/channels',
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
                                collapsed ? 'w-[27px] opacity-100' : 'w-[85px] opacity-100'
                            )}
                        >
                            <Image
                                src={collapsed ? '/icon-black.svg' : '/logo-black.svg'}
                                alt={tCommon('appName')}
                                width={collapsed ? 27 : 85}
                                height={27}
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

            {isSystemAdmin && !collapsed && (
                <div className="px-3 pb-2 space-y-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-2">
                        <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {tSidebar('organizationSwitcherTitle')}
                        </p>
                        <input
                            value={orgSearch}
                            onChange={(event) => setOrgSearch(event.target.value)}
                            placeholder={tSidebar('organizationSwitcherSearch')}
                            className="mt-2 h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 outline-none ring-[#242A40]/20 transition focus:bg-white focus:ring-2"
                        />
                        <div className="mt-2 max-h-32 space-y-1 overflow-auto pr-1">
                            {filteredOrganizations.map((organization) => {
                                const isActive = organization.id === organizationId
                                return (
                                    <button
                                        key={organization.id}
                                        type="button"
                                        disabled={isSwitchingOrg || isActive}
                                        onClick={() => handleOrganizationSwitch(organization.id)}
                                        className={cn(
                                            'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                            isActive
                                                ? 'bg-[#242A40]/10 text-[#242A40]'
                                                : 'text-slate-700 hover:bg-slate-100',
                                            (isSwitchingOrg || isActive) && 'cursor-not-allowed opacity-80'
                                        )}
                                    >
                                        <p className="truncate font-medium">{organization.name}</p>
                                        <p className="truncate text-[11px] text-slate-400">{organization.slug}</p>
                                    </button>
                                )
                            })}
                            {filteredOrganizations.length === 0 && (
                                <p className="px-2 py-1 text-xs text-slate-400">
                                    {tSidebar('organizationSwitcherEmpty')}
                                </p>
                            )}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 px-1">
                            <p className="truncate text-[11px] text-slate-500">
                                {currentOrganization?.name ?? tSidebar('organizationSwitcherNoSelection')}
                            </p>
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
                    {readOnlyTenantMode && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">
                            {tSidebar('readOnlyTenantMode')}
                        </p>
                    )}
                </div>
            )}

            <div className="px-3 pb-2">
                <Link
                    href="/settings/ai"
                    prefetch={false}
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

            <nav className="flex-1 px-3 pt-3">
                <div className="space-y-4">
                    {[...sections, ...adminSections].map(section => (
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
                                            prefetch={false}
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

            <div className="px-3 pb-3">
                <div className="space-y-2">
                    {footerSections.map(section => (
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
                                            prefetch={false}
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
