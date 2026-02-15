interface SearchParamsLike {
    get(name: string): string | null
}

const BILLING_REFRESH_QUERY_KEYS = [
    'checkout_action',
    'checkout_status',
    'checkout_error'
] as const

export function buildBillingRefreshSignal(searchParams: SearchParamsLike | null | undefined): string {
    if (!searchParams) return ''

    return BILLING_REFRESH_QUERY_KEYS
        .map((key) => `${key}=${searchParams.get(key) ?? ''}`)
        .join('|')
}
