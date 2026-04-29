'use client'

import { useEffect, useRef, useState } from 'react'
import { resetIyzicoCheckoutRuntime } from '@/lib/billing/providers/iyzico/checkout-embed'

interface HostedCheckoutEmbedProps {
    checkoutFormContent: string
    checkoutPageUrl?: string | null
    loadingTitle: string
    loadingDescription: string
    fallbackTitle: string
    fallbackDescription: string
    fallbackActionLabel: string
}

const FALLBACK_TIMEOUT_MS = 2500

function hasMountedCheckout(container: HTMLDivElement) {
    if (container.querySelector('iframe, form')) {
        return true
    }

    return Array.from(container.children).some((child) => {
        if (!(child instanceof HTMLElement)) return false
        if (child.id === 'iyzipay-checkout-form') return false
        if (child.tagName === 'SCRIPT') return false
        return true
    })
}

export function HostedCheckoutEmbed({
    checkoutFormContent,
    checkoutPageUrl,
    loadingTitle,
    loadingDescription,
    fallbackTitle,
    fallbackDescription,
    fallbackActionLabel
}: HostedCheckoutEmbedProps) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [isCheckoutVisible, setIsCheckoutVisible] = useState(false)
    const [isFallbackVisible, setIsFallbackVisible] = useState(false)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        queueMicrotask(() => {
            setIsCheckoutVisible(false)
            setIsFallbackVisible(false)
        })
        resetIyzicoCheckoutRuntime(document, window)
        container.innerHTML = ''

        const mountNode = document.createElement('div')
        mountNode.id = 'iyzipay-checkout-form'
        mountNode.className = 'responsive'
        container.appendChild(mountNode)

        const parser = new DOMParser()
        const parsed = parser.parseFromString(checkoutFormContent, 'text/html')
        const scripts = Array.from(parsed.querySelectorAll('script'))

        const syncMountedState = () => {
            const mounted = hasMountedCheckout(container)
            setIsCheckoutVisible(mounted)
            if (mounted) {
                setIsFallbackVisible(false)
            }
        }

        const observer = new MutationObserver(syncMountedState)
        observer.observe(container, { childList: true, subtree: true })

        for (const child of Array.from(parsed.body.childNodes)) {
            if (child.nodeName.toLowerCase() === 'script') continue
            container.appendChild(child.cloneNode(true))
        }

        for (const scriptElement of scripts) {
            const script = document.createElement('script')
            for (const attribute of Array.from(scriptElement.attributes)) {
                script.setAttribute(attribute.name, attribute.value)
            }
            script.text = scriptElement.textContent ?? ''
            container.appendChild(script)
        }

        syncMountedState()
        const fallbackTimeoutId = window.setTimeout(() => {
            if (!hasMountedCheckout(container) && checkoutPageUrl) {
                setIsFallbackVisible(true)
            }
        }, FALLBACK_TIMEOUT_MS)

        return () => {
            observer.disconnect()
            window.clearTimeout(fallbackTimeoutId)
            resetIyzicoCheckoutRuntime(document, window)
            container.innerHTML = ''
        }
    }, [checkoutFormContent, checkoutPageUrl])

    return (
        <div className="w-full space-y-4">
            {!isCheckoutVisible ? (
                <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-8 text-center shadow-sm">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" aria-hidden />
                    <div className="space-y-2">
                        <p className="text-base font-semibold text-gray-900">{loadingTitle}</p>
                        <p className="text-sm text-gray-600">{loadingDescription}</p>
                    </div>

                    {isFallbackVisible && checkoutPageUrl ? (
                        <div className="w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 text-left">
                            <p className="text-sm font-semibold text-blue-950">{fallbackTitle}</p>
                            <p className="mt-1 text-sm text-blue-900">{fallbackDescription}</p>
                            <a
                                href={checkoutPageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700"
                            >
                                {fallbackActionLabel}
                            </a>
                        </div>
                    ) : null}
                </div>
            ) : null}

            <div ref={containerRef} className="w-full" />
        </div>
    )
}
