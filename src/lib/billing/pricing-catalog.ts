import { createClient } from '@/lib/supabase/server'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

export type BillingPlanTierId = 'starter' | 'growth' | 'scale'
export type BillingTopupPackId = 'topup_250' | 'topup_500' | 'topup_1000'
export type BillingCurrency = 'TRY' | 'USD'

interface PlatformBillingPricingRow {
    default_trial_credits: number
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

export interface BillingConversationRange {
    min: number
    max: number
}

export interface BillingCatalogPlanTier {
    id: BillingPlanTierId
    credits: number
    priceTry: number
    priceUsd: number
    conversationRange: BillingConversationRange
}

export interface BillingCatalogTopupPack {
    id: BillingTopupPackId
    credits: number
    priceTry: number
    priceUsd: number
    conversationRange: BillingConversationRange
}

export interface BillingPricingCatalog {
    trialCredits: number
    plans: BillingCatalogPlanTier[]
    topups: BillingCatalogTopupPack[]
}

const FALLBACK_CATALOG: BillingPricingCatalog = {
    trialCredits: 200,
    plans: [
        {
            id: 'starter',
            credits: 1000,
            priceTry: 349,
            priceUsd: 9.99,
            conversationRange: { min: 90, max: 120 }
        },
        {
            id: 'growth',
            credits: 2000,
            priceTry: 649,
            priceUsd: 17.99,
            conversationRange: { min: 180, max: 240 }
        },
        {
            id: 'scale',
            credits: 4000,
            priceTry: 999,
            priceUsd: 26.99,
            conversationRange: { min: 360, max: 480 }
        }
    ],
    topups: [
        {
            id: 'topup_250',
            credits: 250,
            priceTry: 99,
            priceUsd: 2.99,
            conversationRange: { min: 22, max: 30 }
        },
        {
            id: 'topup_500',
            credits: 500,
            priceTry: 189,
            priceUsd: 5.49,
            conversationRange: { min: 45, max: 60 }
        },
        {
            id: 'topup_1000',
            credits: 1000,
            priceTry: 349,
            priceUsd: 9.99,
            conversationRange: { min: 90, max: 120 }
        }
    ]
}

function toNonNegativeNumber(value: unknown) {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, parsed)
}

function mapConversationRange(credits: number): BillingConversationRange {
    const safeCredits = Math.max(0, Math.round(credits))
    return {
        min: Math.max(1, Math.floor(safeCredits * 0.09)),
        max: Math.max(1, Math.floor(safeCredits * 0.12))
    }
}

function mapRowToCatalog(row: PlatformBillingPricingRow | null): BillingPricingCatalog {
    if (!row) return FALLBACK_CATALOG

    const [fallbackStarterPlan, fallbackGrowthPlan, fallbackScalePlan] = FALLBACK_CATALOG.plans
    const [fallbackTopup250, fallbackTopup500, fallbackTopup1000] = FALLBACK_CATALOG.topups
    if (
        !fallbackStarterPlan
        || !fallbackGrowthPlan
        || !fallbackScalePlan
        || !fallbackTopup250
        || !fallbackTopup500
        || !fallbackTopup1000
    ) {
        return FALLBACK_CATALOG
    }

    const starterCredits = toNonNegativeNumber(row.starter_plan_credits)
    const growthCredits = toNonNegativeNumber(row.growth_plan_credits)
    const scaleCredits = toNonNegativeNumber(row.scale_plan_credits)

    const catalog: BillingPricingCatalog = {
        trialCredits: toNonNegativeNumber(row.default_trial_credits) || FALLBACK_CATALOG.trialCredits,
        plans: [
            {
                id: 'starter',
                credits: starterCredits || fallbackStarterPlan.credits,
                priceTry: toNonNegativeNumber(row.starter_plan_price_try) || fallbackStarterPlan.priceTry,
                priceUsd: toNonNegativeNumber(row.starter_plan_price_usd) || fallbackStarterPlan.priceUsd,
                conversationRange: mapConversationRange(starterCredits || fallbackStarterPlan.credits)
            },
            {
                id: 'growth',
                credits: growthCredits || fallbackGrowthPlan.credits,
                priceTry: toNonNegativeNumber(row.growth_plan_price_try) || fallbackGrowthPlan.priceTry,
                priceUsd: toNonNegativeNumber(row.growth_plan_price_usd) || fallbackGrowthPlan.priceUsd,
                conversationRange: mapConversationRange(growthCredits || fallbackGrowthPlan.credits)
            },
            {
                id: 'scale',
                credits: scaleCredits || fallbackScalePlan.credits,
                priceTry: toNonNegativeNumber(row.scale_plan_price_try) || fallbackScalePlan.priceTry,
                priceUsd: toNonNegativeNumber(row.scale_plan_price_usd) || fallbackScalePlan.priceUsd,
                conversationRange: mapConversationRange(scaleCredits || fallbackScalePlan.credits)
            }
        ],
        topups: [
            {
                id: 'topup_250',
                credits: 250,
                priceTry: toNonNegativeNumber(row.topup_250_price_try) || fallbackTopup250.priceTry,
                priceUsd: toNonNegativeNumber(row.topup_250_price_usd) || fallbackTopup250.priceUsd,
                conversationRange: mapConversationRange(250)
            },
            {
                id: 'topup_500',
                credits: 500,
                priceTry: toNonNegativeNumber(row.topup_500_price_try) || fallbackTopup500.priceTry,
                priceUsd: toNonNegativeNumber(row.topup_500_price_usd) || fallbackTopup500.priceUsd,
                conversationRange: mapConversationRange(500)
            },
            {
                id: 'topup_1000',
                credits: 1000,
                priceTry: toNonNegativeNumber(row.topup_1000_price_try) || fallbackTopup1000.priceTry,
                priceUsd: toNonNegativeNumber(row.topup_1000_price_usd) || fallbackTopup1000.priceUsd,
                conversationRange: mapConversationRange(1000)
            }
        ]
    }

    return catalog
}

export function resolveBillingCurrencyByLocale(locale: string): BillingCurrency {
    return locale.startsWith('tr') ? 'TRY' : 'USD'
}

export function resolveLocalizedMoneyForLocale(
    locale: string,
    prices: { priceTry: number; priceUsd: number }
): {
    currency: BillingCurrency
    amount: number
} {
    const currency = resolveBillingCurrencyByLocale(locale)
    return {
        currency,
        amount: currency === 'TRY' ? prices.priceTry : prices.priceUsd
    }
}

export async function getBillingPricingCatalog(options?: {
    supabase?: SupabaseClientLike
}): Promise<BillingPricingCatalog> {
    const supabase = options?.supabase ?? await createClient()
    const { data, error } = await supabase
        .from('platform_billing_settings')
        .select(`
            default_trial_credits,
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
        console.error('Failed to load billing pricing catalog:', error)
        return FALLBACK_CATALOG
    }

    return mapRowToCatalog((data ?? null) as PlatformBillingPricingRow | null)
}

export function resolveConversationRangeForCredits(credits: number) {
    return mapConversationRange(credits)
}
