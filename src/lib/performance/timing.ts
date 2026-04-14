interface WithDevTimingOptions {
    enabled?: boolean
    log?: (message: string, metadata: { durationMs: number }) => void
    now?: () => number
}

function shouldEnableDevTiming(options?: WithDevTimingOptions) {
    if (typeof options?.enabled === 'boolean') {
        return options.enabled
    }

    return process.env.DASHBOARD_PERF_DEBUG === '1'
}

function getDefaultNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
}

export async function withDevTiming<T>(
    label: string,
    work: () => T | Promise<T>,
    options?: WithDevTimingOptions
): Promise<T> {
    if (!shouldEnableDevTiming(options)) {
        return work()
    }

    const now = options?.now ?? getDefaultNow
    const log = options?.log ?? console.info
    const startedAt = now()

    try {
        return await work()
    } finally {
        const durationMs = Math.round((now() - startedAt) * 100) / 100
        log(`[perf] ${label}`, { durationMs })
    }
}
