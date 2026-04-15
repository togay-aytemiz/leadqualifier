import { createDashboardClientCache } from '@/lib/dashboard/client-cache'

export interface ClientProfile {
  id: string
  full_name: string | null
  email: string
  avatar_url: string | null
}

export interface ClientCurrentUser {
  id: string
}

const PROFILE_CLIENT_CACHE_TTL_MS = 5 * 60 * 1000
const PROFILE_CLIENT_CACHE_MAX_ENTRIES = 64
const CURRENT_USER_CLIENT_CACHE_TTL_MS = 60 * 1000

export const profileClientCache = createDashboardClientCache<ClientProfile>({
  maxEntries: PROFILE_CLIENT_CACHE_MAX_ENTRIES,
  ttlMs: PROFILE_CLIENT_CACHE_TTL_MS,
})

const currentUserClientCache = createDashboardClientCache<ClientCurrentUser | null>({
  maxEntries: 1,
  ttlMs: CURRENT_USER_CLIENT_CACHE_TTL_MS,
})

export function buildProfileClientCacheKey(profileId: string) {
  return `profile::${profileId.trim()}`
}

export function clearProfileClientCache() {
  profileClientCache.clear()
  currentUserClientCache.clear()
}

export function getCachedProfile(profileId: string) {
  const normalizedProfileId = profileId.trim()
  if (!normalizedProfileId) return null

  return profileClientCache.get(buildProfileClientCacheKey(normalizedProfileId))
}

export function loadProfileWithCache(
  profileId: string,
  loader: () => Promise<ClientProfile>,
  options: {
    onError?: (error: unknown) => void
    onUpdate?: (profile: ClientProfile) => void
  } = {}
) {
  const normalizedProfileId = profileId.trim()
  if (!normalizedProfileId) {
    return Promise.reject(new Error('Profile id is required'))
  }

  return profileClientCache.getOrLoad(buildProfileClientCacheKey(normalizedProfileId), loader, {
    allowStale: true,
    onError: options.onError,
    onUpdate: options.onUpdate,
  })
}

export function loadCurrentUserWithCache(loader: () => Promise<ClientCurrentUser | null>) {
  return currentUserClientCache.getOrLoad('current-user', loader, { allowStale: true })
}

export function primeProfileCache(profile: ClientProfile | null | undefined) {
  const normalizedProfileId = profile?.id?.trim()
  if (!normalizedProfileId || !profile) return

  profileClientCache.set(buildProfileClientCacheKey(normalizedProfileId), {
    avatar_url: profile.avatar_url,
    email: profile.email,
    full_name: profile.full_name,
    id: normalizedProfileId,
  })
}
