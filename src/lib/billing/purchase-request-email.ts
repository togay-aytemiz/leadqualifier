import type { BillingPurchaseRequestEmailStatus } from '@/types/database'

export interface BillingPurchaseRequestEmailInput {
    organizationName: string
    organizationId: string
    requesterName: string | null
    requesterEmail: string | null
    requestType: string
    requestedLabel: string
    requestedCredits: number | null
    requestedAmount: number | null
    requestedCurrency: 'TRY' | 'USD' | null
    locale: string
    createdAt: string
    adminUrl: string
}

export interface BillingPurchaseRequestEmailResult {
    status: BillingPurchaseRequestEmailStatus
    error: string | null
}

function readEnv(name: string) {
    const value = process.env[name]
    if (!value) return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function truncateError(value: string) {
    const normalized = value.trim().replace(/\s+/g, ' ')
    if (!normalized) return 'Unknown Resend error'
    return normalized.slice(0, 240)
}

function formatRequester(input: BillingPurchaseRequestEmailInput) {
    const name = input.requesterName?.trim()
    const email = input.requesterEmail?.trim()
    if (name && email) return `${name} <${email}>`
    return name || email || 'Unknown requester'
}

function buildEmailText(input: BillingPurchaseRequestEmailInput) {
    const amount = input.requestedAmount !== null && input.requestedCurrency
        ? `${input.requestedAmount} ${input.requestedCurrency}`
        : 'Not specified'
    const credits = input.requestedCredits !== null
        ? String(input.requestedCredits)
        : 'Not specified'

    return [
        'A new Qualy purchase request was submitted.',
        '',
        `Organization: ${input.organizationName} (${input.organizationId})`,
        `Requester: ${formatRequester(input)}`,
        `Type: ${input.requestType}`,
        `Request: ${input.requestedLabel}`,
        `Credits: ${credits}`,
        `Amount: ${amount}`,
        `Locale: ${input.locale}`,
        `Created: ${input.createdAt}`,
        `Admin: ${input.adminUrl}`
    ].join('\n')
}

export async function sendBillingPurchaseRequestEmail(
    input: BillingPurchaseRequestEmailInput
): Promise<BillingPurchaseRequestEmailResult> {
    const apiKey = readEnv('RESEND_API_KEY')
    const emailTo = readEnv('BILLING_REQUEST_EMAIL_TO')
    const emailFrom = readEnv('BILLING_REQUEST_EMAIL_FROM')

    if (!apiKey || !emailTo || !emailFrom) {
        return {
            status: 'not_configured',
            error: null
        }
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: emailFrom,
                to: [emailTo],
                subject: `Qualy purchase request: ${input.organizationName} - ${input.requestedLabel}`,
                text: buildEmailText(input)
            })
        })

        if (!response.ok) {
            const body = await response.text().catch(() => '')
            return {
                status: 'failed',
                error: truncateError(`Resend ${response.status}: ${body}`)
            }
        }

        return {
            status: 'sent',
            error: null
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Resend error'
        return {
            status: 'failed',
            error: truncateError(message)
        }
    }
}
