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

export function useMetaOAuthPopupTransport({
    organizationId,
    locale
}: UseMetaOAuthPopupTransportOptions) {
    const searchParams = useSearchParams()

    useEffect(() => {
        const status = searchParams.get('meta_oauth')
        const channel = searchParams.get('channel')
        const error = searchParams.get('meta_oauth_error')
        const isMetaPopup = searchParams.get('meta_oauth_popup') === '1'

        if (!status || !isMetaPopup) return
        if (!window.opener || window.opener.closed) return

        window.opener.postMessage({
            source: 'meta-oauth',
            status,
            channel,
            error
        }, window.location.origin)
        window.close()
    }, [searchParams])

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return

            const payload = event.data as {
                source?: string
                status?: string
                channel?: string
                error?: string | null
            } | null

            if (!payload || payload.source !== 'meta-oauth' || !payload.status) return

            const url = new URL(window.location.href)
            url.searchParams.set('meta_oauth', payload.status)
            if (payload.channel) {
                url.searchParams.set('channel', payload.channel)
            }
            if (payload.error) {
                url.searchParams.set('meta_oauth_error', payload.error)
            } else {
                url.searchParams.delete('meta_oauth_error')
            }
            url.searchParams.delete('meta_oauth_popup')

            window.location.assign(url.toString())
        }

        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [])

    const popupResult = useMemo<MetaOAuthPopupResult | null>(() => {
        const status = searchParams.get('meta_oauth')
        const isMetaPopup = searchParams.get('meta_oauth_popup') === '1'

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
