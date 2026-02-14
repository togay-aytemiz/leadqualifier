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
    default_package_credits: number
}

export interface AdminPlatformBillingDefaults {
    defaultTrialDays: number
    defaultTrialCredits: number
    defaultPackagePriceTry: number
    defaultPackageCredits: number
}

const FALLBACK_BILLING_DEFAULTS: AdminPlatformBillingDefaults = {
    defaultTrialDays: 14,
    defaultTrialCredits: 120,
    defaultPackagePriceTry: 0,
    defaultPackageCredits: 0
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
        defaultTrialCredits: Number(row.default_trial_credits) || 0,
        defaultPackagePriceTry: Number(row.default_package_price_try) || 0,
        defaultPackageCredits: Number(row.default_package_credits) || 0
    }
}

export async function getPlatformBillingDefaults(options?: {
    supabase?: Awaited<ReturnType<typeof createClient>>
}): Promise<AdminPlatformBillingDefaults> {
    const supabase = options?.supabase ?? await createClient()

    const { data, error } = await supabase
        .from('platform_billing_settings')
        .select('default_trial_days, default_trial_credits, default_package_price_try, default_package_credits')
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
    defaultPackagePriceTry: number
    defaultPackageCredits: number
    reason: string
}): Promise<AdminBillingActionResult> {
    const reason = normalizeReason(input.reason)
    const defaultTrialDays = toPositiveInteger(input.defaultTrialDays)
    const defaultTrialCredits = toNonNegativeNumber(input.defaultTrialCredits)
    const defaultPackagePriceTry = toNonNegativeNumber(input.defaultPackagePriceTry)
    const defaultPackageCredits = toNonNegativeNumber(input.defaultPackageCredits)

    if (!reason || defaultTrialDays === null || defaultTrialCredits === null || defaultPackagePriceTry === null || defaultPackageCredits === null) {
        return failure('invalid_input')
    }

    const auth = await requireAdminContext()
    if (auth.status !== 'ok') {
        return failure(auth.status)
    }

    const nextDefaults: AdminPlatformBillingDefaults = {
        defaultTrialDays,
        defaultTrialCredits,
        defaultPackagePriceTry,
        defaultPackageCredits
    }

    const { data: existingSettings, error: existingSettingsError } = await auth.context.supabase
        .from('platform_billing_settings')
        .select('default_trial_days, default_trial_credits, default_package_price_try, default_package_credits')
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
            default_package_credits: nextDefaults.defaultPackageCredits,
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
