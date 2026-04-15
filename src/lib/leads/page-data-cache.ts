import { createDashboardClientCache } from '@/lib/dashboard/client-cache'
import type { LeadsPageData } from '@/lib/leads/page-data'

const LEADS_PAGE_DATA_CACHE_TTL_MS = 2 * 60 * 1000
const LEADS_PAGE_DATA_CACHE_MAX_ENTRIES = 16

export const leadsPageDataCache = createDashboardClientCache<LeadsPageData>({
  maxEntries: LEADS_PAGE_DATA_CACHE_MAX_ENTRIES,
  ttlMs: LEADS_PAGE_DATA_CACHE_TTL_MS,
})

export function buildLeadsPageDataCacheKey(options: {
  organizationId: string
  queryState: unknown
}) {
  return `${options.organizationId}::${JSON.stringify(options.queryState)}`
}

export function getCachedLeadsPageData(key: string) {
  return leadsPageDataCache.get(key)
}

export function primeLeadsPageDataCache(key: string, data: LeadsPageData) {
  leadsPageDataCache.set(key, data)
}
