import { describe, expect, it, vi } from 'vitest'

import { createDashboardClientCache } from '@/lib/dashboard/client-cache'

describe('dashboard client cache', () => {
  it('serves fresh cached data without calling the loader', async () => {
    const now = vi.fn(() => 1_000)
    const cache = createDashboardClientCache<string>({
      maxEntries: 2,
      now,
      ttlMs: 5_000,
    })
    const loader = vi.fn(async () => 'network')

    cache.set('calendar:current', 'cached')

    await expect(cache.getOrLoad('calendar:current', loader)).resolves.toBe('cached')
    expect(loader).not.toHaveBeenCalled()
  })

  it('dedupes concurrent loads for the same key', async () => {
    const cache = createDashboardClientCache<string>({
      maxEntries: 2,
      ttlMs: 5_000,
    })
    let resolveLoader: (value: string) => void = () => {}
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoader = resolve
        })
    )

    const first = cache.getOrLoad('leads:page-1', loader)
    const second = cache.getOrLoad('leads:page-1', loader)

    expect(loader).toHaveBeenCalledTimes(1)
    resolveLoader('loaded')

    await expect(Promise.all([first, second])).resolves.toEqual(['loaded', 'loaded'])
    expect(cache.get('leads:page-1')).toBe('loaded')
  })

  it('returns stale data immediately while revalidating in the background', async () => {
    let currentTime = 1_000
    const cache = createDashboardClientCache<string>({
      maxEntries: 2,
      now: () => currentTime,
      ttlMs: 100,
    })
    const onUpdate = vi.fn()
    const loader = vi.fn(async () => 'fresh')

    cache.set('settings:calendar', 'stale')
    currentTime = 1_500

    await expect(
      cache.getOrLoad('settings:calendar', loader, {
        allowStale: true,
        onUpdate,
      })
    ).resolves.toBe('stale')

    await vi.waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith('fresh')
    })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.get('settings:calendar')).toBe('fresh')
  })

  it('evicts least recently inserted entries when the cache exceeds its cap', () => {
    const cache = createDashboardClientCache<string>({
      maxEntries: 2,
      ttlMs: 5_000,
    })

    cache.set('one', '1')
    cache.set('two', '2')
    cache.set('three', '3')

    expect(cache.getStale('one')).toBeNull()
    expect(cache.getStale('two')).toBe('2')
    expect(cache.getStale('three')).toBe('3')
  })
})
