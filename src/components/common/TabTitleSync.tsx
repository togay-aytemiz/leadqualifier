'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  listenForInboxUnreadState,
  listenForInboxUnreadUpdates,
  shouldRefreshInboxUnreadIndicator,
} from '@/lib/inbox/unread-events'
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
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean | null>(null)

  const supabase = useMemo(() => createClient(), [])

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

  const titleMap = useMemo<Record<TabRouteId, string>>(
    () => ({
      home: tNav('dashboard'),
      inbox: tNav('inbox'),
      calendar: tNav('calendar'),
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

    const { data, error } = await supabase
      .from('conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .gt('unread_count', 0)
      .limit(1)

    if (error) {
      console.error('Failed to load tab unread indicator', error)
      return
    }

    setHasUnread((data ?? []).length > 0)
  }, [organizationId, supabase])

  useEffect(() => {
    if (routeId === 'inbox') {
      if (isDesktopViewport === null || isDesktopViewport === true) {
        return
      }
      const timer = window.setTimeout(() => {
        void refreshUnread()
      }, 0)
      return () => window.clearTimeout(timer)
    }

    const timer = window.setTimeout(() => {
      setHasUnread(false)
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [isDesktopViewport, refreshUnread, routeId])

  useEffect(() => {
    if (isDesktopViewport !== false) return
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
            void refreshUnread()
          }
        )
        .subscribe()
    }

    void setupRealtime()

    return () => {
      isMounted = false
      if (unreadChannel) {
        supabase.removeChannel(unreadChannel)
      }
    }
  }, [isDesktopViewport, organizationId, refreshUnread, routeId, supabase])

  useEffect(() => {
    if (isDesktopViewport !== false) return
    if (routeId !== 'inbox' || !organizationId) return

    return listenForInboxUnreadUpdates((detail) => {
      if (!shouldRefreshInboxUnreadIndicator(organizationId, detail)) return
      void refreshUnread()
    })
  }, [isDesktopViewport, organizationId, refreshUnread, routeId])

  useEffect(() => {
    if (routeId !== 'inbox' || !organizationId) return

    return listenForInboxUnreadState((detail) => {
      if (!shouldRefreshInboxUnreadIndicator(organizationId, detail)) return
      if (typeof detail.hasUnread !== 'boolean') return
      setHasUnread(detail.hasUnread)
    })
  }, [organizationId, routeId])

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
