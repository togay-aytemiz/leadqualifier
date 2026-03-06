'use client'

import { useEffect, useRef } from 'react'
import { resetIyzicoCheckoutRuntime } from '@/lib/billing/providers/iyzico/checkout-embed'

interface SubscriptionCheckoutEmbedProps {
    checkoutFormContent: string
}

export function SubscriptionCheckoutEmbed({ checkoutFormContent }: SubscriptionCheckoutEmbedProps) {
    const containerRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        resetIyzicoCheckoutRuntime(document, window)
        container.innerHTML = ''

        const mountNode = document.createElement('div')
        mountNode.id = 'iyzipay-checkout-form'
        mountNode.className = 'responsive'
        container.appendChild(mountNode)

        const parser = new DOMParser()
        const parsed = parser.parseFromString(checkoutFormContent, 'text/html')
        const scripts = Array.from(parsed.querySelectorAll('script'))

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

        return () => {
            resetIyzicoCheckoutRuntime(document, window)
            container.innerHTML = ''
        }
    }, [checkoutFormContent])

    return <div ref={containerRef} />
}
