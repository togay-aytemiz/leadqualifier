import { formatDistance, type Locale } from 'date-fns'

function toValidDate(value: string): Date | null {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatRelativeTimeFromBase(options: {
    targetIso: string
    baseDate: Date
    locale?: Locale
}): string {
    const targetDate = toValidDate(options.targetIso)
    if (!targetDate) return ''

    return formatDistance(targetDate, options.baseDate, {
        addSuffix: false,
        locale: options.locale
    }).replace('about ', '')
}
