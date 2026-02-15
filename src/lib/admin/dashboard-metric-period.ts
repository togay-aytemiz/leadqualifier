export const ADMIN_METRIC_PERIOD_ALL = 'all'

const MONTH_KEY_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

function toMonthKey(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function parseMonthKey(monthKey: string) {
    if (!MONTH_KEY_REGEX.test(monthKey)) return null

    const [yearText, monthText] = monthKey.split('-')
    const year = Number.parseInt(yearText ?? '', 10)
    const monthIndex = Number.parseInt(monthText ?? '', 10) - 1
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null

    const monthStart = new Date(Date.UTC(year, monthIndex, 1))
    const nextMonthStart = new Date(Date.UTC(year, monthIndex + 1, 1))

    return {
        monthStartIso: monthStart.toISOString(),
        nextMonthStartIso: nextMonthStart.toISOString()
    }
}

export function resolveAdminMetricPeriodKey(
    value: string | null | undefined,
    now: Date = new Date()
) {
    const normalized = value?.trim().toLowerCase()
    if (!normalized || normalized === ADMIN_METRIC_PERIOD_ALL) {
        return ADMIN_METRIC_PERIOD_ALL
    }

    if (!MONTH_KEY_REGEX.test(normalized)) {
        return ADMIN_METRIC_PERIOD_ALL
    }

    // Future months are invalid for historical usage reporting.
    const currentMonthKey = toMonthKey(now)
    if (normalized > currentMonthKey) {
        return ADMIN_METRIC_PERIOD_ALL
    }

    return normalized
}

export function resolveAdminMetricPeriodRange(periodKey: string) {
    if (periodKey === ADMIN_METRIC_PERIOD_ALL) return null
    return parseMonthKey(periodKey)
}

export function buildRecentAdminMetricMonthKeys(options?: {
    now?: Date
    months?: number
}) {
    const now = options?.now ?? new Date()
    const months = Math.max(1, Math.floor(options?.months ?? 12))
    const monthKeys: string[] = []

    for (let index = 0; index < months; index += 1) {
        const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
        monthKeys.push(toMonthKey(monthDate))
    }

    return monthKeys
}
