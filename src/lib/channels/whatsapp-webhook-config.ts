import type { WhatsAppWebhookSubscriptionOverrides } from '@/lib/whatsapp/client'

export function resolveConfiguredAppUrl() {
    const candidates = [
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
        process.env.URL
    ]

    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue
        const trimmed = candidate.trim().replace(/\/+$/, '')
        if (trimmed) return trimmed
    }

    return null
}

export function resolveWhatsAppWebhookSubscriptionOverrides(
    verifyToken: string
): WhatsAppWebhookSubscriptionOverrides | undefined {
    const appUrl = resolveConfiguredAppUrl()
    if (!appUrl) return undefined

    return {
        overrideCallbackUri: `${appUrl}/api/webhooks/whatsapp`,
        verifyToken
    }
}
