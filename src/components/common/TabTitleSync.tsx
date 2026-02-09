'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildTabDocumentTitle, resolveTabRouteId, type TabRouteId } from '@/lib/tab-title'

interface TabTitleSyncProps {
    organizationId?: string | null
    brandTitle?: string
}

export function TabTitleSync({ organizationId = null, brandTitle = 'Qualy' }: TabTitleSyncProps) {
    const pathname = usePathname()
    const routeId = resolveTabRouteId(pathname)

    const tNav = useTranslations('nav')
    const tSidebar = useTranslations('mainSidebar')
    const tAuth = useTranslations('auth')

    const [hasUnread, setHasUnread] = useState(false)

    const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
    if (!supabaseRef.current) {
        supabaseRef.current = createClient()
    }
    const supabase = supabaseRef.current

    const titleMap = useMemo<Record<TabRouteId, string>>(
        () => ({
            home: tNav('dashboard'),
            inbox: tNav('inbox'),
            leads: tNav('leads'),
            skills: tNav('skills'),
            knowledge: tNav('knowledgeBase'),
            simulator: tNav('simulator'),
            settings: tNav('settings'),
            adminDashboard: tSidebar('adminDashboard'),
            adminOrganizations: tSidebar('adminOrganizations'),
            adminLeads: tSidebar('adminLeads'),
            adminUsers: tSidebar('adminUsers'),
            login: tAuth('login'),
            register: tAuth('register'),
            forgotPassword: tAuth('forgotPasswordTitle'),
            resetPassword: tAuth('resetPasswordTitle'),
        }),
        [tAuth, tNav, tSidebar]
    )

    const refreshUnread = useCallback(async () => {
        if (!organizationId) {
            setHasUnread(false)
            return
        }

        const { count, error } = await supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .gt('unread_count', 0)

        if (error) {
            console.error('Failed to load tab unread indicator', error)
            return
        }

        setHasUnread((count ?? 0) > 0)
    }, [organizationId, supabase])

    useEffect(() => {
        if (routeId === 'inbox') {
            refreshUnread()
            return
        }

        setHasUnread(false)
    }, [refreshUnread, routeId])

    useEffect(() => {
        if (routeId !== 'inbox' || !organizationId) return

        let unreadChannel: ReturnType<typeof supabase.channel> | null = null
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
                .channel(`tab_unread_${organizationId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'conversations',
                        filter: `organization_id=eq.${organizationId}`,
                    },
                    () => {
                        refreshUnread()
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
        }
    }, [organizationId, refreshUnread, routeId, supabase])

    useEffect(() => {
        const pageTitle = routeId ? titleMap[routeId] : null
        const nextTitle = buildTabDocumentTitle({
            pageTitle,
            brandTitle,
            showUnreadDot: routeId === 'inbox' && hasUnread,
        })

        if (document.title !== nextTitle) {
            document.title = nextTitle
        }
    }, [brandTitle, hasUnread, routeId, titleMap])

    return null
}
