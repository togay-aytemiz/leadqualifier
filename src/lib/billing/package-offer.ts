import { createClient } from '@/lib/supabase/server'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

interface BillingPackageVersionRow {
    monthly_price_try: number | string | null
    monthly_credits: number | string | null
    effective_from: string
    effective_to: string | null
}

export interface BillingPackageOffer {
    monthlyPriceTry: number
    monthlyCredits: number
    source: 'package_version' | 'billing_account' | 'fallback'
}

interface GetBillingPackageOfferInput {
    nowIso?: string
    fallbackMonthlyCredits?: number
    supabase?: SupabaseClientLike
}

const DEFAULT_OFFER: BillingPackageOffer = {
    monthlyPriceTry: 0,
    monthlyCredits: 0,
    source: 'fallback'
}

function toNonNegativeNumber(value: unknown) {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, parsed)
}

function isVersionActive(version: BillingPackageVersionRow, nowIso: string) {
    const nowDate = new Date(nowIso)
    const effectiveFrom = new Date(version.effective_from)
    const effectiveTo = version.effective_to ? new Date(version.effective_to) : null

    if (!Number.isFinite(nowDate.getTime())) return false
    if (!Number.isFinite(effectiveFrom.getTime())) return false
    if (nowDate < effectiveFrom) return false
    if (effectiveTo && Number.isFinite(effectiveTo.getTime()) && nowDate >= effectiveTo) return false
    return true
}

export async function getCurrentBillingPackageOffer(
    input: GetBillingPackageOfferInput = {}
): Promise<BillingPackageOffer> {
    const supabase = input.supabase ?? await createClient()
    const nowIso = input.nowIso ?? new Date().toISOString()
    const fallbackMonthlyCredits = toNonNegativeNumber(input.fallbackMonthlyCredits ?? 0)

    const { data, error } = await supabase
        .from('billing_package_versions')
        .select('monthly_price_try, monthly_credits, effective_from, effective_to')
        .order('effective_from', { ascending: false })
        .limit(20)

    if (error) {
        console.error('Failed to load billing package versions:', error)
        if (fallbackMonthlyCredits > 0) {
            return {
                monthlyPriceTry: 0,
                monthlyCredits: fallbackMonthlyCredits,
                source: 'billing_account'
            }
        }
        return DEFAULT_OFFER
    }

    const versions = (data ?? []) as BillingPackageVersionRow[]
    const activeVersion = versions.find((version) => isVersionActive(version, nowIso))
    if (activeVersion) {
        return {
            monthlyPriceTry: toNonNegativeNumber(activeVersion.monthly_price_try),
            monthlyCredits: toNonNegativeNumber(activeVersion.monthly_credits),
            source: 'package_version'
        }
    }

    if (fallbackMonthlyCredits > 0) {
        return {
            monthlyPriceTry: 0,
            monthlyCredits: fallbackMonthlyCredits,
            source: 'billing_account'
        }
    }

    return DEFAULT_OFFER
}
