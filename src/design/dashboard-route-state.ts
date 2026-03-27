'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DASHBOARD_ROUTE_TRANSITION_START_EVENT,
  normalizeDashboardRoutePath,
  resolveDashboardRouteSkeleton,
  resolveOptimisticDashboardPath,
} from '@/design/dashboard-route-transition'

const PENDING_DASHBOARD_ROUTE_TIMEOUT_MS = 8000

interface DashboardRouteTransitionStartDetail {
  href?: string
}

export { resolveOptimisticDashboardPath } from '@/design/dashboard-route-transition'

export function useDashboardRouteState(pathname: string) {
  const currentPath = useMemo(() => normalizeDashboardRoutePath(pathname), [pathname])
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const optimisticPendingPath = useMemo(
    () => (currentPath === pendingPath ? null : pendingPath),
    [currentPath, pendingPath]
  )

  useEffect(() => {
    if (!optimisticPendingPath) return

    const timeoutId = window.setTimeout(() => {
      setPendingPath((activePendingPath) =>
        activePendingPath === optimisticPendingPath ? null : activePendingPath
      )
    }, PENDING_DASHBOARD_ROUTE_TIMEOUT_MS)

    return () => window.clearTimeout(timeoutId)
  }, [optimisticPendingPath])

  useEffect(() => {
    const handleTransitionStart = (event: Event) => {
      const detail = (event as CustomEvent<DashboardRouteTransitionStartDetail>).detail
      const targetPath = detail?.href ? normalizeDashboardRoutePath(detail.href) : null

      if (!targetPath || targetPath === currentPath) return
      if (!resolveDashboardRouteSkeleton(targetPath)) return
      setPendingPath(targetPath)
    }

    window.addEventListener(
      DASHBOARD_ROUTE_TRANSITION_START_EVENT,
      handleTransitionStart as EventListener
    )

    return () => {
      window.removeEventListener(
        DASHBOARD_ROUTE_TRANSITION_START_EVENT,
        handleTransitionStart as EventListener
      )
    }
  }, [currentPath])

  const activePath = useMemo(
    () => resolveOptimisticDashboardPath(currentPath, optimisticPendingPath),
    [currentPath, optimisticPendingPath]
  )

  return {
    activePath,
    currentPath,
    pendingPath: optimisticPendingPath,
  }
}

export function useDashboardOptimisticPath(pathname: string) {
  return useDashboardRouteState(pathname).activePath
}
