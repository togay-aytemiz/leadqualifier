'use client'

import { useEffect, useMemo } from 'react'

import { PageSkeleton } from '@/design'
import { useRouter } from '@/i18n/navigation'
import { DashboardRouteSkeleton } from '@/components/common/DashboardRouteSkeleton'
import { resolveDashboardRouteSkeleton } from '@/design/dashboard-route-transition'

interface AuthSuccessTransitionProps {
    redirectPath: string | null | undefined
}

export function AuthSuccessTransition({ redirectPath }: AuthSuccessTransitionProps) {
    const router = useRouter()
    const routeSkeleton = useMemo(
        () => resolveDashboardRouteSkeleton(redirectPath ?? null),
        [redirectPath]
    )

    useEffect(() => {
        if (!redirectPath) return

        router.prefetch(redirectPath)

        const frameId = window.requestAnimationFrame(() => {
            router.replace(redirectPath)
        })

        return () => {
            window.cancelAnimationFrame(frameId)
        }
    }, [redirectPath, router])

    if (!redirectPath) {
        return null
    }

    return (
        <div className="fixed inset-0 z-[200] bg-white">
            {routeSkeleton
                ? <DashboardRouteSkeleton route={routeSkeleton} />
                : <PageSkeleton />}
        </div>
    )
}
