'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { DASHBOARD_ROUTE_TRANSITION_START_EVENT } from '@/design/dashboard-route-transition'
import {
    buildChunkRecoveryUrl,
    CHUNK_PENDING_ROUTE_SESSION_KEY,
    CHUNK_RETRY_PARAM,
    CHUNK_RETRY_SESSION_KEY,
    shouldAttemptChunkRecovery,
    shouldRecoverFromChunkError
} from '@/lib/navigation/chunk-load-recovery'

interface DashboardRouteTransitionStartDetail {
    href?: string
}

function resolveScriptSource(target: EventTarget | null) {
    if (typeof HTMLScriptElement !== 'undefined' && target instanceof HTMLScriptElement) {
        return target.src
    }

    if (typeof HTMLLinkElement !== 'undefined' && target instanceof HTMLLinkElement) {
        return target.href
    }

    return null
}

export function ChunkLoadRecovery() {
    const pathname = usePathname()

    useEffect(() => {
        const pendingRoutePath = sessionStorage.getItem(CHUNK_PENDING_ROUTE_SESSION_KEY)
        if (!pendingRoutePath) {
            return
        }

        if (!shouldAttemptChunkRecovery(pendingRoutePath, pathname)) {
            sessionStorage.removeItem(CHUNK_PENDING_ROUTE_SESSION_KEY)
        }
    }, [pathname])

    useEffect(() => {
        const currentUrl = new URL(window.location.href)
        const currentPath = `${currentUrl.pathname}${currentUrl.search}`

        if (currentUrl.searchParams.has(CHUNK_RETRY_PARAM)) {
            currentUrl.searchParams.delete(CHUNK_RETRY_PARAM)
            window.history.replaceState(window.history.state, '', currentUrl.toString())
        }

        sessionStorage.removeItem(CHUNK_RETRY_SESSION_KEY)

        const attemptRecovery = () => {
            const pendingRoutePath = sessionStorage.getItem(CHUNK_PENDING_ROUTE_SESSION_KEY)
            const recoveryPath = pendingRoutePath ?? currentPath
            const previousAttemptPath = sessionStorage.getItem(CHUNK_RETRY_SESSION_KEY)
            if (!shouldAttemptChunkRecovery(previousAttemptPath, recoveryPath)) {
                return
            }

            sessionStorage.setItem(CHUNK_RETRY_SESSION_KEY, recoveryPath)
            window.location.replace(
                buildChunkRecoveryUrl(window.location.href, Date.now(), pendingRoutePath)
            )
        }

        const handleDashboardRouteTransitionStart = (event: Event) => {
            const detail = (event as CustomEvent<DashboardRouteTransitionStartDetail>).detail
            const targetPath = detail?.href?.trim()
            if (!targetPath) {
                return
            }

            sessionStorage.setItem(CHUNK_PENDING_ROUTE_SESSION_KEY, targetPath)
        }

        const handleError = (event: Event) => {
            const errorEvent = event as ErrorEvent
            if (!shouldRecoverFromChunkError({
                message: errorEvent.message,
                scriptSrc: resolveScriptSource(errorEvent.target)
            })) {
                return
            }

            attemptRecovery()
        }

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            const reason = event.reason as { message?: string | null } | null
            if (!shouldRecoverFromChunkError({
                message: typeof reason?.message === 'string' ? reason.message : String(event.reason ?? '')
            })) {
                return
            }

            attemptRecovery()
        }

        window.addEventListener(
            DASHBOARD_ROUTE_TRANSITION_START_EVENT,
            handleDashboardRouteTransitionStart as EventListener
        )
        window.addEventListener('error', handleError, true)
        window.addEventListener('unhandledrejection', handleUnhandledRejection)

        return () => {
            window.removeEventListener(
                DASHBOARD_ROUTE_TRANSITION_START_EVENT,
                handleDashboardRouteTransitionStart as EventListener
            )
            window.removeEventListener('error', handleError, true)
            window.removeEventListener('unhandledrejection', handleUnhandledRejection)
        }
    }, [])

    return null
}
