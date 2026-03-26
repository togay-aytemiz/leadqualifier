interface ResolveFilteredConversationBackfillStateInput {
  hasActiveFilters: boolean
  filteredConversationCount: number
  hasMoreConversations: boolean
  isLoadingMoreConversations: boolean
}

export function resolveFilteredConversationBackfillState({
  hasActiveFilters,
  filteredConversationCount,
  hasMoreConversations,
  isLoadingMoreConversations,
}: ResolveFilteredConversationBackfillStateInput) {
  const isEmpty = filteredConversationCount === 0
  const shouldShowLoadingState =
    hasActiveFilters && isEmpty && (hasMoreConversations || isLoadingMoreConversations)
  const shouldLoadMore =
    hasActiveFilters && isEmpty && hasMoreConversations && !isLoadingMoreConversations
  const shouldShowEmptyState = isEmpty && !shouldShowLoadingState

  return {
    shouldLoadMore,
    shouldShowEmptyState,
    shouldShowLoadingState,
  }
}
