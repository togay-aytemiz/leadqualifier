interface SearchParamsLike {
    get(name: string): string | null
}

const BILLING_REFRESH_QUERY_KEYS = [
    'checkout_action',
    'checkout_status',
    'checkout_error'
] as const

export function buildBillingRefreshSignal(
    searchParams: SearchParamsLike | null | undefined,
    pathname?: string | null
): string {
    const normalizedPathname = typeof pathname === 'string' ? pathname.trim() : ''
    const signalParts = normalizedPathname ? [`pathname=${normalizedPathname}`] : []

    if (searchParams) {
        signalParts.push(
            ...BILLING_REFRESH_QUERY_KEYS.map((key) => `${key}=${searchParams.get(key) ?? ''}`)
        )
    }

    return signalParts.join('|')
}
