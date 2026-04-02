const TRANSIENT_STATUS_PARAMS = [
    'checkout_action',
    'checkout_status',
    'checkout_error',
    'checkout_change_type',
    'checkout_effective_at',
    'renewal_action',
    'renewal_status',
    'renewal_error',
    'payment_recovery_action',
    'payment_recovery_status',
    'payment_recovery_error'
] as const

export function hasPlansStatusSearch(searchParams: URLSearchParams) {
    return TRANSIENT_STATUS_PARAMS.some((key) => searchParams.has(key))
}

export function clearPlansStatusSearch(searchParams: URLSearchParams) {
    const nextSearchParams = new URLSearchParams(searchParams.toString())

    for (const key of TRANSIENT_STATUS_PARAMS) {
        nextSearchParams.delete(key)
    }

    const nextQuery = nextSearchParams.toString()
    return nextQuery ? `?${nextQuery}` : ''
}
