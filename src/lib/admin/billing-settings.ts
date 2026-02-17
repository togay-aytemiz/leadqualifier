'use server'

import { createClient } from '@/lib/supabase/server'
import type { AdminBillingActionResult, AdminBillingActionError } from '@/lib/admin/billing-manual'

interface AdminAuthContext {
    supabase: Awaited<ReturnType<typeof createClient>>
    userId: string
}

interface PlatformBillingDefaultsRow {
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

export interface AdminPlatformBillingDefaults {
    defaultTrialDays: number
    defaultTrialCredits: number
    defaultPackagePriceTry: number
    defaultPackagePriceUsd: number
    defaultPackageCredits: number
    starterPlanCredits: number
    starterPlanPriceTry: number
    starterPlanPriceUsd: number
    growthPlanCredits: number
    growthPlanPriceTry: number
    growthPlanPriceUsd: number
    scalePlanCredits: number
    scalePlanPriceTry: number
    scalePlanPriceUsd: number
    topup250PriceTry: number
    topup250PriceUsd: number
    topup500PriceTry: number
    topup500PriceUsd: number
    topup1000PriceTry: number
    topup1000PriceUsd: number
}

const FALLBACK_BILLING_DEFAULTS: AdminPlatformBillingDefaults = {
    defaultTrialDays: 14,
    defaultTrialCredits: 200,
    defaultPackagePriceTry: 349,
    defaultPackagePriceUsd: 9.99,
    defaultPackageCredits: 1000,
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
    topup1000PriceUsd: 9.99
}

function success(): AdminBillingActionResult {
    return {
        ok: true,
        error: null
    }
}

function failure(error: AdminBillingActionError): AdminBillingActionResult {
    return {
        ok: false,
        error
    }
}

function normalizeReason(reason: string) {
    const trimmed = reason.trim()
    if (!trimmed) return null
    return trimmed
}

function toNonNegativeNumber(value: number) {
    if (!Number.isFinite(value)) return null
    if (value < 0) return null
    return value
}

function toPositiveInteger(value: number) {
    if (!Number.isFinite(value)) return null
    const rounded = Math.floor(value)
    if (rounded <= 0 || rounded !== value) return null
    return rounded
}

function isNotAvailableRpcError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const candidate = error as { code?: string | null }
    return candidate.code === '42883' || candidate.code === 'PGRST202' || candidate.code === '42P01'
}

function isPackageConfigChanged(previous: PlatformBillingDefaultsRow | null, next: AdminPlatformBillingDefaults) {
    if (!previous) return true
    return (
        Number(previous.default_package_price_try) !== Number(next.defaultPackagePriceTry)
        || Number(previous.default_package_credits) !== Number(next.defaultPackageCredits)
    )
}

async function requireAdminContext(): Promise<{
    status: 'ok'
    context: AdminAuthContext
} | {
    status: 'unauthorized' | 'forbidden'
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { status: 'unauthorized' }
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_system_admin')
        .eq('id', user.id)
        .maybeSingle()

    if (error || !profile?.is_system_admin) {
        return { status: 'forbidden' }
    }

    return {
        status: 'ok',
        context: {
            supabase,
            userId: user.id
        }
    }
}

function mapRowToDefaults(row: PlatformBillingDefaultsRow | null | undefined): AdminPlatformBillingDefaults {
    if (!row) return FALLBACK_BILLING_DEFAULTS

    return {
        defaultTrialDays: Number(row.default_trial_days) || FALLBACK_BILLING_DEFAULTS.defaultTrialDays,
        defaultTrialCredits: Number(row.default_trial_credits) || FALLBACK_BILLING_DEFAULTS.defaultTrialCredits,
        defaultPackagePriceTry: Number(row.default_package_price_try) || FALLBACK_BILLING_DEFAULTS.defaultPackagePriceTry,
        defaultPackagePriceUsd: Number(row.default_package_price_usd) || FALLBACK_BILLING_DEFAULTS.defaultPackagePriceUsd,
        defaultPackageCredits: Number(row.default_package_credits) || FALLBACK_BILLING_DEFAULTS.defaultPackageCredits,
        starterPlanCredits: Number(row.starter_plan_credits) || FALLBACK_BILLING_DEFAULTS.starterPlanCredits,
        starterPlanPriceTry: Number(row.starter_plan_price_try) || FALLBACK_BILLING_DEFAULTS.starterPlanPriceTry,
        starterPlanPriceUsd: Number(row.starter_plan_price_usd) || FALLBACK_BILLING_DEFAULTS.starterPlanPriceUsd,
        growthPlanCredits: Number(row.growth_plan_credits) || FALLBACK_BILLING_DEFAULTS.growthPlanCredits,
        growthPlanPriceTry: Number(row.growth_plan_price_try) || FALLBACK_BILLING_DEFAULTS.growthPlanPriceTry,
        growthPlanPriceUsd: Number(row.growth_plan_price_usd) || FALLBACK_BILLING_DEFAULTS.growthPlanPriceUsd,
        scalePlanCredits: Number(row.scale_plan_credits) || FALLBACK_BILLING_DEFAULTS.scalePlanCredits,
        scalePlanPriceTry: Number(row.scale_plan_price_try) || FALLBACK_BILLING_DEFAULTS.scalePlanPriceTry,
        scalePlanPriceUsd: Number(row.scale_plan_price_usd) || FALLBACK_BILLING_DEFAULTS.scalePlanPriceUsd,
        topup250PriceTry: Number(row.topup_250_price_try) || FALLBACK_BILLING_DEFAULTS.topup250PriceTry,
        topup250PriceUsd: Number(row.topup_250_price_usd) || FALLBACK_BILLING_DEFAULTS.topup250PriceUsd,
        topup500PriceTry: Number(row.topup_500_price_try) || FALLBACK_BILLING_DEFAULTS.topup500PriceTry,
        topup500PriceUsd: Number(row.topup_500_price_usd) || FALLBACK_BILLING_DEFAULTS.topup500PriceUsd,
        topup1000PriceTry: Number(row.topup_1000_price_try) || FALLBACK_BILLING_DEFAULTS.topup1000PriceTry,
        topup1000PriceUsd: Number(row.topup_1000_price_usd) || FALLBACK_BILLING_DEFAULTS.topup1000PriceUsd
    }
}

export async function getPlatformBillingDefaults(options?: {
    supabase?: Awaited<ReturnType<typeof createClient>>
}): Promise<AdminPlatformBillingDefaults> {
    const supabase = options?.supabase ?? await createClient()

    const { data, error } = await supabase
        .from('platform_billing_settings')
        .select(`
            default_trial_days,
            default_trial_credits,
            default_package_price_try,
            default_package_price_usd,
            default_package_credits,
            starter_plan_credits,
            starter_plan_price_try,
            starter_plan_price_usd,
            growth_plan_credits,
            growth_plan_price_try,
            growth_plan_price_usd,
            scale_plan_credits,
            scale_plan_price_try,
            scale_plan_price_usd,
            topup_250_price_try,
            topup_250_price_usd,
            topup_500_price_try,
            topup_500_price_usd,
            topup_1000_price_try,
            topup_1000_price_usd
        `)
        .eq('key', 'default')
        .maybeSingle()

    if (error) {
        console.error('Failed to load platform billing defaults:', error)
        return FALLBACK_BILLING_DEFAULTS
    }

    return mapRowToDefaults((data ?? null) as PlatformBillingDefaultsRow | null)
}

export async function updatePlatformBillingDefaults(input: {
    defaultTrialDays: number
    defaultTrialCredits: number
    starterPlanCredits: number
    starterPlanPriceTry: number
    starterPlanPriceUsd: number
    growthPlanCredits: number
    growthPlanPriceTry: number
    growthPlanPriceUsd: number
    scalePlanCredits: number
    scalePlanPriceTry: number
    scalePlanPriceUsd: number
    topup250PriceTry: number
    topup250PriceUsd: number
    topup500PriceTry: number
    topup500PriceUsd: number
    topup1000PriceTry: number
    topup1000PriceUsd: number
    reason: string
}): Promise<AdminBillingActionResult> {
    const reason = normalizeReason(input.reason)
    const defaultTrialDays = toPositiveInteger(input.defaultTrialDays)
    const defaultTrialCredits = toNonNegativeNumber(input.defaultTrialCredits)
    const starterPlanCredits = toNonNegativeNumber(input.starterPlanCredits)
    const starterPlanPriceTry = toNonNegativeNumber(input.starterPlanPriceTry)
    const starterPlanPriceUsd = toNonNegativeNumber(input.starterPlanPriceUsd)
    const growthPlanCredits = toNonNegativeNumber(input.growthPlanCredits)
    const growthPlanPriceTry = toNonNegativeNumber(input.growthPlanPriceTry)
    const growthPlanPriceUsd = toNonNegativeNumber(input.growthPlanPriceUsd)
    const scalePlanCredits = toNonNegativeNumber(input.scalePlanCredits)
    const scalePlanPriceTry = toNonNegativeNumber(input.scalePlanPriceTry)
    const scalePlanPriceUsd = toNonNegativeNumber(input.scalePlanPriceUsd)
    const topup250PriceTry = toNonNegativeNumber(input.topup250PriceTry)
    const topup250PriceUsd = toNonNegativeNumber(input.topup250PriceUsd)
    const topup500PriceTry = toNonNegativeNumber(input.topup500PriceTry)
    const topup500PriceUsd = toNonNegativeNumber(input.topup500PriceUsd)
    const topup1000PriceTry = toNonNegativeNumber(input.topup1000PriceTry)
    const topup1000PriceUsd = toNonNegativeNumber(input.topup1000PriceUsd)

    if (
        !reason
        || defaultTrialDays === null
        || defaultTrialCredits === null
        || starterPlanCredits === null
        || starterPlanPriceTry === null
        || starterPlanPriceUsd === null
        || growthPlanCredits === null
        || growthPlanPriceTry === null
        || growthPlanPriceUsd === null
        || scalePlanCredits === null
        || scalePlanPriceTry === null
        || scalePlanPriceUsd === null
        || topup250PriceTry === null
        || topup250PriceUsd === null
        || topup500PriceTry === null
        || topup500PriceUsd === null
        || topup1000PriceTry === null
        || topup1000PriceUsd === null
        || starterPlanCredits <= 0
        || growthPlanCredits <= 0
        || scalePlanCredits <= 0
    ) {
        return failure('invalid_input')
    }

    const auth = await requireAdminContext()
    if (auth.status !== 'ok') {
        return failure(auth.status)
    }

    const nextDefaults: AdminPlatformBillingDefaults = {
        defaultTrialDays,
        defaultTrialCredits,
        defaultPackagePriceTry: starterPlanPriceTry,
        defaultPackagePriceUsd: starterPlanPriceUsd,
        defaultPackageCredits: starterPlanCredits,
        starterPlanCredits,
        starterPlanPriceTry,
        starterPlanPriceUsd,
        growthPlanCredits,
        growthPlanPriceTry,
        growthPlanPriceUsd,
        scalePlanCredits,
        scalePlanPriceTry,
        scalePlanPriceUsd,
        topup250PriceTry,
        topup250PriceUsd,
        topup500PriceTry,
        topup500PriceUsd,
        topup1000PriceTry,
        topup1000PriceUsd
    }

    const { data: existingSettings, error: existingSettingsError } = await auth.context.supabase
        .from('platform_billing_settings')
        .select(`
            default_trial_days,
            default_trial_credits,
            default_package_price_try,
            default_package_price_usd,
            default_package_credits,
            starter_plan_credits,
            starter_plan_price_try,
            starter_plan_price_usd,
            growth_plan_credits,
            growth_plan_price_try,
            growth_plan_price_usd,
            scale_plan_credits,
            scale_plan_price_try,
            scale_plan_price_usd,
            topup_250_price_try,
            topup_250_price_usd,
            topup_500_price_try,
            topup_500_price_usd,
            topup_1000_price_try,
            topup_1000_price_usd
        `)
        .eq('key', 'default')
        .maybeSingle()

    if (existingSettingsError) {
        console.error('Failed to load existing platform billing defaults:', existingSettingsError)
        return failure(isNotAvailableRpcError(existingSettingsError) ? 'not_available' : 'request_failed')
    }

    const { error: upsertError } = await auth.context.supabase
        .from('platform_billing_settings')
        .upsert({
            key: 'default',
            default_trial_days: nextDefaults.defaultTrialDays,
            default_trial_credits: nextDefaults.defaultTrialCredits,
            default_package_price_try: nextDefaults.defaultPackagePriceTry,
            default_package_price_usd: nextDefaults.defaultPackagePriceUsd,
            default_package_credits: nextDefaults.defaultPackageCredits,
            starter_plan_credits: nextDefaults.starterPlanCredits,
            starter_plan_price_try: nextDefaults.starterPlanPriceTry,
            starter_plan_price_usd: nextDefaults.starterPlanPriceUsd,
            growth_plan_credits: nextDefaults.growthPlanCredits,
            growth_plan_price_try: nextDefaults.growthPlanPriceTry,
            growth_plan_price_usd: nextDefaults.growthPlanPriceUsd,
            scale_plan_credits: nextDefaults.scalePlanCredits,
            scale_plan_price_try: nextDefaults.scalePlanPriceTry,
            scale_plan_price_usd: nextDefaults.scalePlanPriceUsd,
            topup_250_price_try: nextDefaults.topup250PriceTry,
            topup_250_price_usd: nextDefaults.topup250PriceUsd,
            topup_500_price_try: nextDefaults.topup500PriceTry,
            topup_500_price_usd: nextDefaults.topup500PriceUsd,
            topup_1000_price_try: nextDefaults.topup1000PriceTry,
            topup_1000_price_usd: nextDefaults.topup1000PriceUsd,
            updated_by: auth.context.userId
        }, {
            onConflict: 'key'
        })

    if (upsertError) {
        console.error('Failed to upsert platform billing defaults:', upsertError)
        return failure(isNotAvailableRpcError(upsertError) ? 'not_available' : 'request_failed')
    }

    if (isPackageConfigChanged((existingSettings ?? null) as PlatformBillingDefaultsRow | null, nextDefaults)) {
        const { error: packageVersionError } = await auth.context.supabase
            .from('billing_package_versions')
            .insert({
                monthly_price_try: nextDefaults.defaultPackagePriceTry,
                monthly_credits: nextDefaults.defaultPackageCredits,
                effective_from: new Date().toISOString(),
                created_by: auth.context.userId
            })

        if (packageVersionError) {
            console.error('Failed to insert package version:', packageVersionError)
            return failure(isNotAvailableRpcError(packageVersionError) ? 'not_available' : 'request_failed')
        }
    }

    return success()
}
