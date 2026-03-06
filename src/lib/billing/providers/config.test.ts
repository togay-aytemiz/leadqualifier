import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    getBillingProviderConfig,
    getIyzicoPlanReferenceCode,
    resolveBillingProvider
} from '@/lib/billing/providers/config'

const originalNodeEnv = process.env.NODE_ENV

describe('billing provider config', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'test'
        delete process.env.BILLING_PROVIDER
        delete process.env.BILLING_MOCK_ENABLED
        delete process.env.IYZICO_API_KEY
        delete process.env.IYZICO_SECRET_KEY
        delete process.env.IYZICO_BASE_URL
        delete process.env.IYZICO_SUBSCRIPTION_PLAN_STARTER_REF
        delete process.env.IYZICO_SUBSCRIPTION_PLAN_GROWTH_REF
        delete process.env.IYZICO_SUBSCRIPTION_PLAN_SCALE_REF
    })

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv
    })

    it('defaults to iyzico provider when BILLING_PROVIDER is not set outside production', () => {
        delete process.env.BILLING_PROVIDER

        expect(resolveBillingProvider()).toBe('iyzico')
    })

    it('defaults to iyzico provider when BILLING_PROVIDER is not set in production', () => {
        process.env.NODE_ENV = 'production'
        delete process.env.BILLING_PROVIDER

        expect(resolveBillingProvider()).toBe('iyzico')
    })

    it('disables mock billing unless explicitly enabled', () => {
        process.env.BILLING_PROVIDER = 'mock'
        delete process.env.BILLING_MOCK_ENABLED

        const config = getBillingProviderConfig()

        expect(config.provider).toBe('mock')
        expect(config.mock.enabled).toBe(false)
        expect(config.mock.error).toBe('provider_not_configured')
    })

    it('allows mock billing only when explicitly enabled', () => {
        process.env.BILLING_PROVIDER = 'mock'
        process.env.BILLING_MOCK_ENABLED = '1'

        const config = getBillingProviderConfig()

        expect(config.provider).toBe('mock')
        expect(config.mock.enabled).toBe(true)
        expect(config.mock.error).toBe(null)
    })

    it('returns not-configured iyzico state when secrets are missing', () => {
        process.env.BILLING_PROVIDER = 'iyzico'
        delete process.env.IYZICO_API_KEY
        delete process.env.IYZICO_SECRET_KEY
        delete process.env.IYZICO_BASE_URL

        const config = getBillingProviderConfig()

        expect(config.provider).toBe('iyzico')
        expect(config.mock.enabled).toBe(false)
        expect(config.iyzico.enabled).toBe(false)
        expect(config.iyzico.error).toBe('provider_not_configured')
    })

    it('returns enabled iyzico config when required secrets exist', () => {
        process.env.BILLING_PROVIDER = 'iyzico'
        process.env.IYZICO_API_KEY = 'api-key'
        process.env.IYZICO_SECRET_KEY = 'secret-key'
        process.env.IYZICO_BASE_URL = 'https://sandbox-api.iyzipay.com'

        const config = getBillingProviderConfig()

        expect(config.provider).toBe('iyzico')
        expect(config.mock.enabled).toBe(false)
        expect(config.iyzico.enabled).toBe(true)
        expect(config.iyzico.baseUrl).toBe('https://sandbox-api.iyzipay.com')
        expect(config.iyzico.error).toBe(null)
    })

    it('resolves subscription plan reference codes from env', () => {
        process.env.IYZICO_SUBSCRIPTION_PLAN_STARTER_REF = 'plan_starter_ref'
        process.env.IYZICO_SUBSCRIPTION_PLAN_GROWTH_REF = 'plan_growth_ref'
        process.env.IYZICO_SUBSCRIPTION_PLAN_SCALE_REF = 'plan_scale_ref'

        expect(getIyzicoPlanReferenceCode('starter')).toBe('plan_starter_ref')
        expect(getIyzicoPlanReferenceCode('growth')).toBe('plan_growth_ref')
        expect(getIyzicoPlanReferenceCode('scale')).toBe('plan_scale_ref')
    })
})
