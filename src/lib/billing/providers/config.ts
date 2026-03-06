import type { BillingPlanTierId } from '@/lib/billing/pricing-catalog'

export type BillingProvider = 'mock' | 'iyzico'

export type BillingProviderConfigError = 'provider_not_configured'

export interface BillingProviderConfig {
    provider: BillingProvider
    mock: {
        enabled: boolean
        error: BillingProviderConfigError | null
    }
    iyzico: {
        enabled: boolean
        apiKey: string | null
        secretKey: string | null
        baseUrl: string | null
        webhookSecret: string | null
        error: BillingProviderConfigError | null
    }
}

function readEnv(name: string) {
    const value = process.env[name]
    if (!value) return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function isTruthyEnvFlag(value: string | null) {
    if (!value) return false

    switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
        return true
    default:
        return false
    }
}

export function resolveBillingProvider(): BillingProvider {
    const raw = readEnv('BILLING_PROVIDER')
    if (!raw) return 'iyzico'

    return raw.toLowerCase() === 'iyzico'
        ? 'iyzico'
        : 'mock'
}

function resolveIyzicoBaseUrl() {
    return readEnv('IYZICO_BASE_URL')
}

export function getIyzicoPlanReferenceCode(planId: BillingPlanTierId) {
    switch (planId) {
    case 'starter':
        return readEnv('IYZICO_SUBSCRIPTION_PLAN_STARTER_REF')
    case 'growth':
        return readEnv('IYZICO_SUBSCRIPTION_PLAN_GROWTH_REF')
    case 'scale':
        return readEnv('IYZICO_SUBSCRIPTION_PLAN_SCALE_REF')
    default:
        return null
    }
}

export function getBillingProviderConfig(): BillingProviderConfig {
    const provider = resolveBillingProvider()
    const mockEnabled = provider === 'mock'
        && isTruthyEnvFlag(readEnv('BILLING_MOCK_ENABLED'))
    const apiKey = readEnv('IYZICO_API_KEY')
    const secretKey = readEnv('IYZICO_SECRET_KEY')
    const baseUrl = resolveIyzicoBaseUrl()
    const webhookSecret = readEnv('IYZICO_WEBHOOK_SECRET')
    const iyzicoEnabled = provider === 'iyzico'
        && Boolean(apiKey)
        && Boolean(secretKey)
        && Boolean(baseUrl)

    return {
        provider,
        mock: {
            enabled: mockEnabled,
            error: provider === 'mock' && !mockEnabled
                ? 'provider_not_configured'
                : null
        },
        iyzico: {
            enabled: iyzicoEnabled,
            apiKey,
            secretKey,
            baseUrl,
            webhookSecret,
            error: provider === 'iyzico' && !iyzicoEnabled
                ? 'provider_not_configured'
                : null
        }
    }
}
