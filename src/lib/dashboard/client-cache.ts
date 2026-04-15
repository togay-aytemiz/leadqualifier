interface DashboardClientCacheEntry<T> {
  value: T
  updatedAt: number
}

interface DashboardClientCacheOptions {
  maxEntries: number
  ttlMs: number
  now?: () => number
}

interface DashboardClientCacheLoadOptions<T> {
  allowStale?: boolean
  onError?: (error: unknown) => void
  onUpdate?: (value: T) => void
}

export function createDashboardClientCache<T>({
  maxEntries,
  now = () => Date.now(),
  ttlMs,
}: DashboardClientCacheOptions) {
  const entries = new Map<string, DashboardClientCacheEntry<T>>()
  const inflight = new Map<string, Promise<T>>()

  const isFresh = (entry: DashboardClientCacheEntry<T>) => now() - entry.updatedAt <= ttlMs

  const prune = () => {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value
      if (!oldestKey) return
      entries.delete(oldestKey)
    }
  }

  const set = (key: string, value: T) => {
    if (entries.has(key)) {
      entries.delete(key)
    }

    entries.set(key, {
      updatedAt: now(),
      value,
    })
    prune()
  }

  const load = (
    key: string,
    loader: () => Promise<T>,
    options: DashboardClientCacheLoadOptions<T> = {}
  ) => {
    const currentInflight = inflight.get(key)
    if (currentInflight) {
      return currentInflight
    }

    const request = loader()
      .then((value) => {
        set(key, value)
        options.onUpdate?.(value)
        return value
      })
      .catch((error: unknown) => {
        options.onError?.(error)
        throw error
      })
      .finally(() => {
        inflight.delete(key)
      })

    inflight.set(key, request)
    return request
  }

  return {
    clear() {
      entries.clear()
      inflight.clear()
    },
    delete(key: string) {
      entries.delete(key)
      inflight.delete(key)
    },
    get(key: string) {
      const entry = entries.get(key)
      if (!entry || !isFresh(entry)) return null
      return entry.value
    },
    getOrLoad(
      key: string,
      loader: () => Promise<T>,
      options: DashboardClientCacheLoadOptions<T> = {}
    ) {
      const entry = entries.get(key)
      if (entry && isFresh(entry)) {
        return Promise.resolve(entry.value)
      }

      if (entry && options.allowStale) {
        if (!inflight.has(key)) {
          void load(key, loader, options).catch(() => {
            // The caller already received stale data. Keep stale-while-revalidate failures local.
          })
        }

        return Promise.resolve(entry.value)
      }

      return load(key, loader, options)
    },
    getStale(key: string) {
      return entries.get(key)?.value ?? null
    },
    hasInflight(key: string) {
      return inflight.has(key)
    },
    set,
  }
}
