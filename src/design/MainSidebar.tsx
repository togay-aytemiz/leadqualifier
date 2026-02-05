'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { AiBotMode } from '@/types/database'
import {
    ArrowLeftFromLine,
    ArrowRightFromLine,
    BookOpen,
    Bot,
    Inbox,
    LogOut,
    MessageSquare,
    Settings,
    Sparkles,
} from 'lucide-react'

const STORAGE_KEY = 'leadqualifier.sidebarCollapsed'

interface MainSidebarProps {
    userName?: string
}

export function MainSidebar({ userName }: MainSidebarProps) {
    const pathname = usePathname()
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}\//, '/')
    const tNav = useTranslations('nav')
    const tCommon = useTranslations('common')
    const tSidebar = useTranslations('mainSidebar')
    const currentLocale = useLocale()

    const [collapsed, setCollapsed] = useState(false)
    const [hasUnread, setHasUnread] = useState(false)
    const [hasPendingSuggestions, setHasPendingSuggestions] = useState(false)
    const [organizationId, setOrganizationId] = useState<string | null>(null)
    const [botMode, setBotMode] = useState<AiBotMode>('active')

    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
    if (!supabaseRef.current) {
        supabaseRef.current = createClient()
    }
    const supabase = supabaseRef.current

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
        let query = supabase
            .from('offering_profile_suggestions')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .is('archived_at', null)
            .or('status.eq.pending,status.is.null')

        const { count, error } = await query

        if (error) {
            console.error('Failed to load pending suggestion indicator', error)
            return
        }

        setHasPendingSuggestions((count ?? 0) > 0)
    }, [currentLocale, supabase])

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
        let isMounted = true

        const loadOrganization = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: profile } = await supabase
                .from('profiles')
                .select('is_system_admin')
                .eq('id', user.id)
                .single()

            let orgId: string | null = null

            if (profile?.is_system_admin) {
                const { data: org } = await supabase
                    .from('organizations')
                    .select('id')
                    .limit(1)
                    .single()
                orgId = org?.id ?? null
            } else {
                const { data: membership } = await supabase
                    .from('organization_members')
                    .select('organization_id')
                    .eq('user_id', user.id)
                    .limit(1)
                    .single()
                orgId = membership?.organization_id ?? null
            }

            if (!isMounted || !orgId) return

            setOrganizationId(orgId)
            await refreshUnread(orgId)
            await fetchBotMode(orgId)
            await refreshPendingSuggestions(orgId)
        }

        loadOrganization()

        return () => {
            isMounted = false
        }
    }, [fetchBotMode, refreshPendingSuggestions, refreshUnread, supabase])

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
                    { id: 'inbox', href: '/inbox', label: tNav('inbox'), icon: Inbox },
                    { id: 'simulator', href: '/simulator', label: tNav('simulator'), icon: MessageSquare },
                ],
            },
            {
                id: 'ai',
                label: tSidebar('aiTools'),
                items: [
                    { id: 'skills', href: '/skills', label: tNav('skills'), icon: Sparkles },
                    { id: 'knowledge', href: '/knowledge', label: tNav('knowledgeBase'), icon: BookOpen },
                ],
            },
        ],
        [tNav, tSidebar]
    )

    const footerSections = useMemo(
        () => [
            {
                id: 'other',
                label: tSidebar('other'),
                items: [{ id: 'settings', href: '/settings/channels', label: tNav('settings'), icon: Settings }],
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
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
                            <Bot size={20} />
                        </div>
                        <div
                            className={cn(
                                'flex flex-col transition-all duration-200 motion-reduce:transition-none',
                                collapsed ? 'w-0 translate-x-2 overflow-hidden opacity-0' : 'opacity-100'
                            )}
                        >
                            <span className="text-sm font-semibold tracking-tight">{tCommon('appName')}</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCollapsed(prev => !prev)}
                        className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-900 hover:ring-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200',
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
                    {sections.map(section => (
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
                                    const isActive = pathWithoutLocale.startsWith(item.href)
                                    const Icon = item.icon
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
                                                    ? 'bg-blue-600 text-white shadow-sm'
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
                                                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-slate-50" />
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
                                                        isActive ? 'bg-white ring-blue-200' : 'bg-blue-500 ring-white'
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
                                    const Icon = item.icon
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
                                                    ? 'bg-blue-600 text-white shadow-sm'
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
                                                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-slate-50" />
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
                                                        isActive ? 'bg-white ring-blue-200' : 'bg-blue-500 ring-white'
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
