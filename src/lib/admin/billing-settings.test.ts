import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updatePlatformBillingDefaults } from '@/lib/admin/billing-settings'

const { createClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

interface BillingSettingsRow {
    default_trial_days: number
    default_trial_credits: number
    default_package_price_try: number
    default_package_price_usd: number
    default_package_credits: number
    starter_plan_credits: number
    starter_plan_price_try: number
    starter_plan_price_usd: number
    growth_plan_credits: number
    growth_plan_price_try: number
    growth_plan_price_usd: number
    scale_plan_credits: number
    scale_plan_price_try: number
    scale_plan_price_usd: number
    topup_250_price_try: number
    topup_250_price_usd: number
    topup_500_price_try: number
    topup_500_price_usd: number
    topup_1000_price_try: number
    topup_1000_price_usd: number
}

interface SupabaseMockOptions {
    userId?: string | null
    isSystemAdmin?: boolean
    profileError?: unknown
    billingSettingsRow?: BillingSettingsRow | null
    billingSettingsSelectError?: unknown
    upsertError?: unknown
    packageInsertError?: unknown
}

function createSupabaseMock(options: SupabaseMockOptions = {}) {
    const authGetUserMock = vi.fn(async () => ({
        data: {
            user: options.userId === null
                ? null
                : { id: options.userId ?? 'admin-user-1' }
        }
    }))

    const profileMaybeSingleMock = vi.fn(async () => ({
        data: { is_system_admin: options.isSystemAdmin ?? true },
        error: options.profileError ?? null
    }))
    const profileEqMock = vi.fn(() => ({ maybeSingle: profileMaybeSingleMock }))
    const profileSelectMock = vi.fn(() => ({ eq: profileEqMock }))

    const billingSettingsMaybeSingleMock = vi.fn(async () => ({
        data: options.billingSettingsRow ?? {
            default_trial_days: 14,
            default_trial_credits: 200,
            default_package_price_try: 349,
            default_package_price_usd: 9.99,
            default_package_credits: 1000,
            starter_plan_credits: 1000,
            starter_plan_price_try: 349,
            starter_plan_price_usd: 9.99,
            growth_plan_credits: 2000,
            growth_plan_price_try: 649,
            growth_plan_price_usd: 17.99,
            scale_plan_credits: 4000,
            scale_plan_price_try: 949,
            scale_plan_price_usd: 26.99,
            topup_250_price_try: 99,
            topup_250_price_usd: 2.99,
            topup_500_price_try: 189,
            topup_500_price_usd: 5.49,
            topup_1000_price_try: 349,
            topup_1000_price_usd: 9.99
        },
        error: options.billingSettingsSelectError ?? null
    }))
    const billingSettingsEqMock = vi.fn(() => ({ maybeSingle: billingSettingsMaybeSingleMock }))
    const billingSettingsSelectMock = vi.fn(() => ({ eq: billingSettingsEqMock }))
    const billingSettingsUpsertMock = vi.fn(async () => ({
        error: options.upsertError ?? null
    }))

    const billingPackageInsertMock = vi.fn(async () => ({
        error: options.packageInsertError ?? null
    }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'profiles') {
            return {
                select: profileSelectMock
            }
        }
        if (table === 'platform_billing_settings') {
            return {
                select: billingSettingsSelectMock,
                upsert: billingSettingsUpsertMock
            }
        }
        if (table === 'billing_package_versions') {
            return {
                insert: billingPackageInsertMock
            }
        }

        throw new Error(`Unexpected table requested in test mock: ${table}`)
    })

    return {
        supabase: {
            auth: {
                getUser: authGetUserMock
            },
            from: fromMock
        },
        authGetUserMock,
        profileMaybeSingleMock,
        billingSettingsMaybeSingleMock,
        billingSettingsUpsertMock,
        billingPackageInsertMock
    }
}

function createValidInput() {
    return {
        defaultTrialDays: 14,
        defaultTrialCredits: 200,
        starterPlanCredits: 1000,
        starterPlanPriceTry: 349,
        starterPlanPriceUsd: 9.99,
        growthPlanCredits: 2000,
        growthPlanPriceTry: 649,
        growthPlanPriceUsd: 17.99,
        scalePlanCredits: 4000,
        scalePlanPriceTry: 949,
        scalePlanPriceUsd: 26.99,
        topup250PriceTry: 99,
        topup250PriceUsd: 2.99,
        topup500PriceTry: 189,
        topup500PriceUsd: 5.49,
        topup1000PriceTry: 349,
        topup1000PriceUsd: 9.99,
        reason: 'policy update'
    }
}

describe('admin billing settings', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns invalid_input when defaults are invalid', async () => {
        const result = await updatePlatformBillingDefaults({
            ...createValidInput(),
            defaultTrialDays: 0
        })

        expect(result).toEqual({
            ok: false,
            error: 'invalid_input'
        })
        expect(createClientMock).not.toHaveBeenCalled()
    })

    it('returns unauthorized when there is no authenticated user', async () => {
        const { supabase } = createSupabaseMock({
            userId: null
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await updatePlatformBillingDefaults(createValidInput())

        expect(result).toEqual({
            ok: false,
            error: 'unauthorized'
        })
    })

    it('returns forbidden for non-system-admin users', async () => {
        const { supabase } = createSupabaseMock({
            isSystemAdmin: false
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await updatePlatformBillingDefaults(createValidInput())

        expect(result).toEqual({
            ok: false,
            error: 'forbidden'
        })
    })

    it('updates defaults and writes a package version when package terms change', async () => {
        const { supabase, billingSettingsUpsertMock, billingPackageInsertMock } = createSupabaseMock({
            billingSettingsRow: {
                default_trial_days: 14,
                default_trial_credits: 200,
                default_package_price_try: 349,
                default_package_price_usd: 9.99,
                default_package_credits: 1000,
                starter_plan_credits: 1000,
                starter_plan_price_try: 349,
                starter_plan_price_usd: 9.99,
                growth_plan_credits: 2000,
                growth_plan_price_try: 649,
                growth_plan_price_usd: 17.99,
                scale_plan_credits: 4000,
                scale_plan_price_try: 949,
                scale_plan_price_usd: 26.99,
                topup_250_price_try: 99,
                topup_250_price_usd: 2.99,
                topup_500_price_try: 189,
                topup_500_price_usd: 5.49,
                topup_1000_price_try: 349,
                topup_1000_price_usd: 9.99
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await updatePlatformBillingDefaults({
            defaultTrialDays: 14,
            defaultTrialCredits: 220,
            starterPlanCredits: 1200,
            starterPlanPriceTry: 399,
            starterPlanPriceUsd: 10.99,
            growthPlanCredits: 2400,
            growthPlanPriceTry: 749,
            growthPlanPriceUsd: 19.99,
            scalePlanCredits: 4500,
            scalePlanPriceTry: 1090,
            scalePlanPriceUsd: 29.99,
            topup250PriceTry: 109,
            topup250PriceUsd: 3.49,
            topup500PriceTry: 209,
            topup500PriceUsd: 5.99,
            topup1000PriceTry: 389,
            topup1000PriceUsd: 10.99,
            reason: 'raise package limits'
        })

        expect(result).toEqual({
            ok: true,
            error: null
        })
        expect(billingSettingsUpsertMock).toHaveBeenCalledTimes(1)
        expect(billingPackageInsertMock).toHaveBeenCalledTimes(1)
    })

    it('updates defaults without writing a package version when package terms are unchanged', async () => {
        const { supabase, billingPackageInsertMock } = createSupabaseMock({
            billingSettingsRow: {
                default_trial_days: 14,
                default_trial_credits: 200,
                default_package_price_try: 349,
                default_package_price_usd: 9.99,
                default_package_credits: 1000,
                starter_plan_credits: 1000,
                starter_plan_price_try: 349,
                starter_plan_price_usd: 9.99,
                growth_plan_credits: 2000,
                growth_plan_price_try: 649,
                growth_plan_price_usd: 17.99,
                scale_plan_credits: 4000,
                scale_plan_price_try: 949,
                scale_plan_price_usd: 26.99,
                topup_250_price_try: 99,
                topup_250_price_usd: 2.99,
                topup_500_price_try: 189,
                topup_500_price_usd: 5.49,
                topup_1000_price_try: 349,
                topup_1000_price_usd: 9.99
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await updatePlatformBillingDefaults({
            defaultTrialDays: 21,
            defaultTrialCredits: 240,
            starterPlanCredits: 1000,
            starterPlanPriceTry: 349,
            starterPlanPriceUsd: 9.99,
            growthPlanCredits: 2000,
            growthPlanPriceTry: 649,
            growthPlanPriceUsd: 17.99,
            scalePlanCredits: 4000,
            scalePlanPriceTry: 949,
            scalePlanPriceUsd: 26.99,
            topup250PriceTry: 99,
            topup250PriceUsd: 2.99,
            topup500PriceTry: 189,
            topup500PriceUsd: 5.49,
            topup1000PriceTry: 349,
            topup1000PriceUsd: 9.99,
            reason: 'trial policy update'
        })

        expect(result).toEqual({
            ok: true,
            error: null
        })
        expect(billingPackageInsertMock).not.toHaveBeenCalled()
    })
})
