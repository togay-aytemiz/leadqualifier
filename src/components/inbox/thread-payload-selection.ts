interface SelectedThreadCacheDecisionInput {
  hasCachedThreadPayload: boolean
  hasCachedPreviewMessage: boolean
  hasListPreviewMessage: boolean
  loadedConversationMatchesSelection: boolean
}

export function shouldHydrateSelectedThreadFromCache(input: SelectedThreadCacheDecisionInput) {
  if (!input.hasCachedThreadPayload) return false
  if (input.loadedConversationMatchesSelection) return false
  return !input.hasListPreviewMessage || input.hasCachedPreviewMessage
}

export function shouldDiscardSelectedThreadCache(input: SelectedThreadCacheDecisionInput) {
  if (!input.hasCachedThreadPayload) return false
  if (input.loadedConversationMatchesSelection) return false
  return input.hasListPreviewMessage && !input.hasCachedPreviewMessage
}
