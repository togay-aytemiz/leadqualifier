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
    default_package_credits: number
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
            default_trial_credits: 120,
            default_package_price_try: 40,
            default_package_credits: 1000
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
        defaultTrialCredits: 120,
        defaultPackagePriceTry: 40,
        defaultPackageCredits: 1000,
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
                default_trial_credits: 120,
                default_package_price_try: 40,
                default_package_credits: 1000
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await updatePlatformBillingDefaults({
            defaultTrialDays: 14,
            defaultTrialCredits: 180,
            defaultPackagePriceTry: 55,
            defaultPackageCredits: 1500,
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
                default_trial_credits: 120,
                default_package_price_try: 40,
                default_package_credits: 1000
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await updatePlatformBillingDefaults({
            defaultTrialDays: 21,
            defaultTrialCredits: 140,
            defaultPackagePriceTry: 40,
            defaultPackageCredits: 1000,
            reason: 'trial policy update'
        })

        expect(result).toEqual({
            ok: true,
            error: null
        })
        expect(billingPackageInsertMock).not.toHaveBeenCalled()
    })
})
