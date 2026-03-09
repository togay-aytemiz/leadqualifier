'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'

interface UseMetaOAuthPopupTransportOptions {
    organizationId: string
    locale: string
}

export interface MetaOAuthPopupResult {
    status: string
    channel: string | null
    error: string | null
}

const META_OAUTH_STORAGE_EVENT_KEY = 'meta_oauth_popup_result'

interface MetaOAuthBridgePayload {
    source: 'meta-oauth'
    status: string
    channel: string | null
    error: string | null
    ts: number
}

function isPopupContextFromWindowName() {
    return typeof window.name === 'string' && window.name.startsWith('meta_oauth_')
}

export function useMetaOAuthPopupTransport({
    organizationId,
    locale
}: UseMetaOAuthPopupTransportOptions) {
    const searchParams = useSearchParams()

    const applyPopupPayload = useCallback((payload: MetaOAuthBridgePayload) => {
        const url = new URL(window.location.href)
        url.searchParams.set('meta_oauth', payload.status)
        if (payload.channel) {
            url.searchParams.set('channel', payload.channel)
        } else {
            url.searchParams.delete('channel')
        }
        if (payload.error) {
            url.searchParams.set('meta_oauth_error', payload.error)
        } else {
            url.searchParams.delete('meta_oauth_error')
        }
        url.searchParams.delete('meta_oauth_popup')

        window.location.assign(url.toString())
    }, [])

    useEffect(() => {
        const status = searchParams.get('meta_oauth')
        const channel = searchParams.get('channel')
        const error = searchParams.get('meta_oauth_error')
        const isMetaPopup = searchParams.get('meta_oauth_popup') === '1' || isPopupContextFromWindowName()

        if (!status || !isMetaPopup) return

        const payload: MetaOAuthBridgePayload = {
            source: 'meta-oauth',
            status,
            channel,
            error,
            ts: Date.now()
        }

        // Primary bridge: postMessage to opener.
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, window.location.origin)
        }

        // Fallback bridge: storage event (covers opener loss after cross-origin OAuth hops).
        try {
            window.localStorage.setItem(META_OAUTH_STORAGE_EVENT_KEY, JSON.stringify(payload))
        } catch {
            // Ignore storage failures; postMessage may still succeed.
        }

        window.close()
    }, [searchParams])

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return

            const payload = event.data as Partial<MetaOAuthBridgePayload> | null
            if (!payload || payload.source !== 'meta-oauth' || !payload.status) return

            applyPopupPayload({
                source: 'meta-oauth',
                status: payload.status,
                channel: payload.channel ?? null,
                error: payload.error ?? null,
                ts: typeof payload.ts === 'number' ? payload.ts : Date.now()
            })
        }

        const onStorage = (event: StorageEvent) => {
            if (event.key !== META_OAUTH_STORAGE_EVENT_KEY || !event.newValue) return

            try {
                const payload = JSON.parse(event.newValue) as Partial<MetaOAuthBridgePayload>
                if (!payload || payload.source !== 'meta-oauth' || !payload.status) return

                applyPopupPayload({
                    source: 'meta-oauth',
                    status: payload.status,
                    channel: payload.channel ?? null,
                    error: payload.error ?? null,
                    ts: typeof payload.ts === 'number' ? payload.ts : Date.now()
                })
            } catch {
                // Ignore malformed storage payloads.
            } finally {
                try {
                    window.localStorage.removeItem(META_OAUTH_STORAGE_EVENT_KEY)
                } catch {
                    // Ignore cleanup failure.
                }
            }
        }

        // Defensive pull: in case storage event fired before listener was attached.
        const pendingPayload = window.localStorage.getItem(META_OAUTH_STORAGE_EVENT_KEY)
        if (pendingPayload) {
            onStorage({
                key: META_OAUTH_STORAGE_EVENT_KEY,
                newValue: pendingPayload
            } as StorageEvent)
        }

        window.addEventListener('message', onMessage)
        window.addEventListener('storage', onStorage)
        return () => {
            window.removeEventListener('message', onMessage)
            window.removeEventListener('storage', onStorage)
        }
    }, [applyPopupPayload])

    const popupResult = useMemo<MetaOAuthPopupResult | null>(() => {
        const status = searchParams.get('meta_oauth')
        const isMetaPopup = searchParams.get('meta_oauth_popup') === '1' || isPopupContextFromWindowName()

        if (!status || isMetaPopup) return null

        return {
            status,
            channel: searchParams.get('channel'),
            error: searchParams.get('meta_oauth_error')
        }
    }, [searchParams])

    const clearPopupResult = useCallback(() => {
        const url = new URL(window.location.href)
        url.searchParams.delete('meta_oauth')
        url.searchParams.delete('channel')
        url.searchParams.delete('meta_oauth_error')
        url.searchParams.delete('meta_oauth_popup')
        window.history.replaceState({}, '', url.toString())
    }, [])

    const startMetaOAuth = useCallback(async (channel: 'whatsapp' | 'instagram') => {
        const params = new URLSearchParams({
            channel,
            organizationId,
            locale,
            returnTo: window.location.pathname,
            popup: '1'
        })

        const startUrl = `/api/channels/meta/start?${params.toString()}`
        const popupWindow = window.open(
            startUrl,
            `meta_oauth_${channel}`,
            'popup=yes,width=560,height=720,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes,status=no'
        )

        if (!popupWindow) {
            window.location.assign(startUrl)
        }
    }, [locale, organizationId])

    return {
        popupResult,
        clearPopupResult,
        startMetaOAuth
    }
}
