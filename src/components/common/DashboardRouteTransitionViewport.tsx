'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DashboardRouteSkeleton } from '@/components/common/DashboardRouteSkeleton'
import {
    DASHBOARD_ROUTE_TRANSITION_START_EVENT,
    normalizeDashboardRoutePath,
    resolveDashboardRouteSkeleton
} from '@/design/dashboard-route-transition'

interface DashboardRouteTransitionViewportProps {
    children: ReactNode
}

interface DashboardRouteTransitionStartDetail {
    href?: string
}

export function DashboardRouteTransitionViewport({
    children
}: DashboardRouteTransitionViewportProps) {
    const pathname = usePathname()
    const currentPath = normalizeDashboardRoutePath(pathname)
    const [pendingPath, setPendingPath] = useState<string | null>(null)
    const pendingSkeleton = useMemo(
        () => resolveDashboardRouteSkeleton(pendingPath),
        [pendingPath]
    )

    useEffect(() => {
        if (!pendingPath) return
        if (currentPath === pendingPath) {
            setPendingPath(null)
        }
    }, [currentPath, pendingPath])

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

    return (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
            {children}
            {pendingSkeleton && (
                <div className="absolute inset-0 z-20 bg-white">
                    <DashboardRouteSkeleton route={pendingSkeleton} />
                </div>
            )}
        </div>
    )
}
