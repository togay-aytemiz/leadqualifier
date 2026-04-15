import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearProfileClientCache,
  getCachedProfile,
  loadCurrentUserWithCache,
  loadProfileWithCache,
  primeProfileCache,
} from '@/lib/profile/client-cache'

describe('profile client cache', () => {
  beforeEach(() => {
    clearProfileClientCache()
  })

  it('dedupes concurrent profile loads for the same user id', async () => {
    let resolveLoader: (value: { id: string; full_name: string; email: string; avatar_url: null }) => void =
      () => {}
    const loader = vi.fn(
      () =>
        new Promise<{ id: string; full_name: string; email: string; avatar_url: null }>((resolve) => {
          resolveLoader = resolve
        })
    )

    const first = loadProfileWithCache('user-1', loader)
    const second = loadProfileWithCache('user-1', loader)

    expect(loader).toHaveBeenCalledTimes(1)
    resolveLoader({
      avatar_url: null,
      email: 'ada@example.com',
      full_name: 'Ada',
      id: 'user-1',
    })

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        avatar_url: null,
        email: 'ada@example.com',
        full_name: 'Ada',
        id: 'user-1',
      },
      {
        avatar_url: null,
        email: 'ada@example.com',
        full_name: 'Ada',
        id: 'user-1',
      },
    ])
    expect(getCachedProfile('user-1')?.email).toBe('ada@example.com')
  })

  it('serves primed profile data without hitting the loader', async () => {
    primeProfileCache({
      avatar_url: null,
      email: 'cache@example.com',
      full_name: 'Cached User',
      id: 'user-2',
    })

    const loader = vi.fn(async () => {
      throw new Error('should not load')
    })

    await expect(loadProfileWithCache('user-2', loader)).resolves.toEqual({
      avatar_url: null,
      email: 'cache@example.com',
      full_name: 'Cached User',
      id: 'user-2',
    })
    expect(loader).not.toHaveBeenCalled()
  })

  it('dedupes concurrent current-user loads', async () => {
    let resolveLoader: (value: { id: string } | null) => void = () => {}
    const loader = vi.fn(
      () =>
        new Promise<{ id: string } | null>((resolve) => {
          resolveLoader = resolve
        })
    )

    const first = loadCurrentUserWithCache(loader)
    const second = loadCurrentUserWithCache(loader)

    expect(loader).toHaveBeenCalledTimes(1)
    resolveLoader({ id: 'user-1' })

    await expect(Promise.all([first, second])).resolves.toEqual([{ id: 'user-1' }, { id: 'user-1' }])
  })
})
