function resolveSafeNumber(value: number) {
    return Math.max(0, Number.isFinite(value) ? value : 0)
}

function resolveSafeDate(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

export function formatSidebarBillingCredits(locale: string, value: number) {
    return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format(resolveSafeNumber(value))
}

export function formatSidebarBillingCompactCredits(locale: string, value: number) {
    return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: resolveSafeNumber(value) >= 10000 ? 0 : 1
    }).format(resolveSafeNumber(value))
}

export function formatSidebarBillingDate(locale: string, value: string) {
    const date = resolveSafeDate(value)
    if (!date) return null

    return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric'
    }).format(date)
}
