'use client'

import { PageHeader } from '@/design'
import { LeadSearch } from '@/components/leads/LeadSearch'
import { LeadsEmptyState } from '@/components/leads/LeadsEmptyState'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { getLeadsPageData, type LeadsPageData } from '@/lib/leads/page-data'
import {
  buildLeadsPageDataCacheKey,
  getCachedLeadsPageData,
  leadsPageDataCache,
  primeLeadsPageDataCache,
} from '@/lib/leads/page-data-cache'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

type LeadsQueryState = {
  page: number
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

type LeadsUrlSyncMode = 'push' | 'replace'

interface LeadsClientProps {
  initialData: LeadsPageData
  initialQueryState: LeadsQueryState
  organizationId: string
}

function buildLeadsCacheKey(queryState: LeadsQueryState, organizationId: string) {
  return buildLeadsPageDataCacheKey({
    organizationId,
    queryState,
  })
}

function readLeadsQueryStateFromSearchParams(searchParams: URLSearchParams): LeadsQueryState {
  const rawPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const sortOrder = searchParams.get('sortOrder')

  return {
    page: Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage,
    search: searchParams.get('search') ?? '',
    sortBy: searchParams.get('sortBy') ?? 'updated_at',
    sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
  }
}

function readLeadsQueryStateFromLocation(): LeadsQueryState {
  if (typeof window === 'undefined') {
    return {
      page: 1,
      search: '',
      sortBy: 'updated_at',
      sortOrder: 'desc',
    }
  }

  return readLeadsQueryStateFromSearchParams(new URLSearchParams(window.location.search))
}

function syncLeadsUrl(queryState: LeadsQueryState, mode: LeadsUrlSyncMode) {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const nextSearchParams = new URLSearchParams()

  if (queryState.page > 1) {
    nextSearchParams.set('page', queryState.page.toString())
  }
  if (queryState.sortBy !== 'updated_at') {
    nextSearchParams.set('sortBy', queryState.sortBy)
  }
  if (queryState.sortOrder !== 'desc') {
    nextSearchParams.set('sortOrder', queryState.sortOrder)
  }
  if (queryState.search) {
    nextSearchParams.set('search', queryState.search)
  }

  const nextSearch = nextSearchParams.toString()
  const nextUrl = nextSearch ? `${url.pathname}?${nextSearch}` : url.pathname

  if (`${url.pathname}${url.search}` === nextUrl) {
    return
  }

  if (mode === 'push') {
    window.history.pushState(window.history.state, '', nextUrl)
    return
  }

  window.history.replaceState(window.history.state, '', nextUrl)
}

export function LeadsClient({ initialData, initialQueryState, organizationId }: LeadsClientProps) {
  const t = useTranslations('leads')
  const historyModeRef = useRef<LeadsUrlSyncMode>('replace')
  const requestIdRef = useRef(0)
  const [queryState, setQueryState] = useState(initialQueryState)
  const [searchValue, setSearchValue] = useState(initialQueryState.search)
  const [pageData, setPageData] = useState(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const cacheKey = useMemo(
    () => buildLeadsCacheKey(queryState, organizationId),
    [organizationId, queryState]
  )

  useEffect(() => {
    primeLeadsPageDataCache(buildLeadsCacheKey(initialQueryState, organizationId), initialData)
  }, [initialData, initialQueryState, organizationId])

  const loadPageData = useCallback(
    async (
      nextQueryState: LeadsQueryState,
      options?: { background?: boolean; requestId?: number }
    ) => {
      const nextCacheKey = buildLeadsCacheKey(nextQueryState, organizationId)
      const cached = getCachedLeadsPageData(nextCacheKey)
      if (cached) {
        setPageData(cached)
        setIsLoading(false)
        return cached
      }

      if (options?.background) {
        const result = await leadsPageDataCache.getOrLoad(nextCacheKey, () =>
          getLeadsPageData(nextQueryState, organizationId)
        )
        return result
      }

      const requestId = options?.requestId ?? requestIdRef.current + 1
      requestIdRef.current = requestId

      setIsLoading(true)

      try {
        const result = await leadsPageDataCache.getOrLoad(
          nextCacheKey,
          () => getLeadsPageData(nextQueryState, organizationId),
          {
            allowStale: true,
            onUpdate: (updatedData) => {
              if (requestIdRef.current === requestId) {
                setPageData(updatedData)
              }
            },
          }
        )

        if (requestIdRef.current !== requestId) {
          return result
        }

        setPageData(result)
        return result
      } catch (error) {
        if (requestIdRef.current === requestId) {
          console.error('Failed to load leads page data', error)
        }
        throw error
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false)
        }
      }
    },
    [organizationId]
  )

  useEffect(() => {
    syncLeadsUrl(queryState, historyModeRef.current)
    historyModeRef.current = 'replace'

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const cached = getCachedLeadsPageData(cacheKey)
    if (cached) {
      setPageData(cached)
      setIsLoading(false)
      return
    }

    void loadPageData(queryState, { requestId })
  }, [cacheKey, loadPageData, queryState])

  useEffect(() => {
    const handlePopState = () => {
      const nextQueryState = readLeadsQueryStateFromLocation()
      historyModeRef.current = 'replace'
      setSearchValue(nextQueryState.search)
      setQueryState(nextQueryState)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (searchValue === queryState.search) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      historyModeRef.current = 'push'
      startTransition(() => {
        setQueryState((previous) => ({
          ...previous,
          page: 1,
          search: searchValue,
        }))
      })
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [queryState.search, searchValue])

  useEffect(() => {
    setSearchValue(queryState.search)
  }, [queryState.search])

  useEffect(() => {
    const { page, totalPages } = pageData.leadsResult
    if (totalPages <= page) {
      return
    }

    const nextQueryState = {
      ...queryState,
      page: page + 1,
    }
    const nextCacheKey = buildLeadsCacheKey(nextQueryState, organizationId)
    if (getCachedLeadsPageData(nextCacheKey)) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void loadPageData(nextQueryState, { background: true })
    }, 150)

    return () => clearTimeout(timeoutId)
  }, [loadPageData, organizationId, pageData.leadsResult, queryState])

  const handleSortChange = useCallback((sortBy: string, sortOrder: 'asc' | 'desc') => {
    historyModeRef.current = 'push'
    startTransition(() => {
      setQueryState((previous) => ({
        ...previous,
        page: 1,
        sortBy,
        sortOrder,
      }))
    })
  }, [])

  const handlePageChange = useCallback((page: number) => {
    historyModeRef.current = 'push'
    startTransition(() => {
      setQueryState((previous) => ({
        ...previous,
        page,
      }))
    })
  }, [])

  return (
    <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
      <PageHeader
        title={t('title')}
        actions={<LeadSearch value={searchValue} onValueChange={setSearchValue} />}
      />
      <div className="flex-1 overflow-auto p-3 md:p-6" aria-busy={isLoading}>
        {pageData.leadsResult.total === 0 ? (
          <div className="flex items-center justify-center h-full">
            <LeadsEmptyState title={t('noLeads')} description={t('noLeadsDesc')} />
          </div>
        ) : (
          <div className={isLoading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
            <LeadsTable
              leads={pageData.leadsResult.leads}
              total={pageData.leadsResult.total}
              page={pageData.leadsResult.page}
              pageSize={pageData.leadsResult.pageSize}
              totalPages={pageData.leadsResult.totalPages}
              sortBy={queryState.sortBy}
              sortOrder={queryState.sortOrder}
              requiredFields={pageData.requiredFields}
              onSortChange={handleSortChange}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>
    </div>
  )
}
