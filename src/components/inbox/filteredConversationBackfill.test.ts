import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveFilteredConversationBackfillState } from '@/components/inbox/filteredConversationBackfill'

const INBOX_CONTAINER_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')

describe('resolveFilteredConversationBackfillState', () => {
  it('requests another page before showing empty state when filters are active and more conversations exist', () => {
    expect(
      resolveFilteredConversationBackfillState({
        hasActiveFilters: true,
        filteredConversationCount: 0,
        hasMoreConversations: true,
        isLoadingMoreConversations: false,
      })
    ).toEqual({
      shouldLoadMore: true,
      shouldShowEmptyState: false,
      shouldShowLoadingState: true,
    })
  })

  it('shows the empty state once filtered backfill is exhausted', () => {
    expect(
      resolveFilteredConversationBackfillState({
        hasActiveFilters: true,
        filteredConversationCount: 0,
        hasMoreConversations: false,
        isLoadingMoreConversations: false,
      })
    ).toEqual({
      shouldLoadMore: false,
      shouldShowEmptyState: true,
      shouldShowLoadingState: false,
    })
  })

  it('keeps the normal empty state behavior when no filters are active', () => {
    expect(
      resolveFilteredConversationBackfillState({
        hasActiveFilters: false,
        filteredConversationCount: 0,
        hasMoreConversations: true,
        isLoadingMoreConversations: false,
      })
    ).toEqual({
      shouldLoadMore: false,
      shouldShowEmptyState: true,
      shouldShowLoadingState: false,
    })
  })

  it('does not request duplicate loads while a filtered backfill request is already running', () => {
    expect(
      resolveFilteredConversationBackfillState({
        hasActiveFilters: true,
        filteredConversationCount: 0,
        hasMoreConversations: true,
        isLoadingMoreConversations: true,
      })
    ).toEqual({
      shouldLoadMore: false,
      shouldShowEmptyState: false,
      shouldShowLoadingState: true,
    })
  })
})

describe('InboxContainer filtered backfill source guard', () => {
  it('uses filtered backfill state to avoid premature empty results on paginated filters', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('resolveFilteredConversationBackfillState')
    expect(source).toContain('filterBackfillState.shouldLoadMore')
    expect(source).toContain('filterBackfillState.shouldShowEmptyState')
  })
})
