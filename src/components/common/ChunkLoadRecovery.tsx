'use client'

import { useEffect } from 'react'
import {
    buildChunkRecoveryUrl,
    CHUNK_RETRY_PARAM,
    CHUNK_RETRY_SESSION_KEY,
    shouldAttemptChunkRecovery,
    shouldRecoverFromChunkError
} from '@/lib/navigation/chunk-load-recovery'

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
    useEffect(() => {
        const currentUrl = new URL(window.location.href)
        const currentPath = `${currentUrl.pathname}${currentUrl.search}`

        if (currentUrl.searchParams.has(CHUNK_RETRY_PARAM)) {
            currentUrl.searchParams.delete(CHUNK_RETRY_PARAM)
            window.history.replaceState(window.history.state, '', currentUrl.toString())
        }

        sessionStorage.removeItem(CHUNK_RETRY_SESSION_KEY)

        const attemptRecovery = () => {
            const previousAttemptPath = sessionStorage.getItem(CHUNK_RETRY_SESSION_KEY)
            if (!shouldAttemptChunkRecovery(previousAttemptPath, currentPath)) {
                return
            }

            sessionStorage.setItem(CHUNK_RETRY_SESSION_KEY, currentPath)
            window.location.replace(buildChunkRecoveryUrl(window.location.href))
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

        window.addEventListener('error', handleError, true)
        window.addEventListener('unhandledrejection', handleUnhandledRejection)

        return () => {
            window.removeEventListener('error', handleError, true)
            window.removeEventListener('unhandledrejection', handleUnhandledRejection)
        }
    }, [])

    return null
}
