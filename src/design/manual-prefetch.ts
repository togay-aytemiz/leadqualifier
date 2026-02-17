const DISABLED_FLAG_VALUES = new Set(['1', 'true', 'yes'])

export function shouldEnableManualRoutePrefetch(
    environment: string = process.env.NODE_ENV ?? '',
    disabledFlag: string | undefined = process.env.NEXT_PUBLIC_DISABLE_MANUAL_PREFETCH
) {
    if (DISABLED_FLAG_VALUES.has((disabledFlag ?? '').trim().toLowerCase())) {
        return false
    }

    if (environment === 'test') {
        return false
    }

    return environment === 'production' || environment === 'development'
}
