'use client'

import { usePathname } from 'next/navigation'
import { useMemo, type ReactNode } from 'react'
import { DashboardRouteSkeleton } from '@/components/common/DashboardRouteSkeleton'
import { resolveDashboardRouteSkeleton } from '@/design/dashboard-route-transition'
import { useDashboardRouteState } from '@/design/dashboard-route-state'

interface DashboardRouteTransitionViewportProps {
    children: ReactNode
}

export function DashboardRouteTransitionViewport({
    children
}: DashboardRouteTransitionViewportProps) {
    const pathname = usePathname()
    const { pendingPath } = useDashboardRouteState(pathname)
    const pendingSkeleton = useMemo(
        () => resolveDashboardRouteSkeleton(pendingPath),
        [pendingPath]
    )

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
