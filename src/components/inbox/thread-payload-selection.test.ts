import { describe, expect, it } from 'vitest'
import {
  shouldDiscardSelectedThreadCache,
  shouldHydrateSelectedThreadFromCache,
} from '@/components/inbox/thread-payload-selection'

describe('thread payload cache selection', () => {
  it('hydrates from cache when switching into an unloaded thread without a list preview', () => {
    expect(
      shouldHydrateSelectedThreadFromCache({
        hasCachedThreadPayload: true,
        hasCachedPreviewMessage: false,
        hasListPreviewMessage: false,
        loadedConversationMatchesSelection: false,
      })
    ).toBe(true)
  })

  it('does not re-apply the cached payload after the selected thread is already loaded', () => {
    expect(
      shouldHydrateSelectedThreadFromCache({
        hasCachedThreadPayload: true,
        hasCachedPreviewMessage: true,
        hasListPreviewMessage: true,
        loadedConversationMatchesSelection: true,
      })
    ).toBe(false)
  })

  it('discards an empty cache entry when the list already proves the thread has content', () => {
    expect(
      shouldDiscardSelectedThreadCache({
        hasCachedThreadPayload: true,
        hasCachedPreviewMessage: false,
        hasListPreviewMessage: true,
        loadedConversationMatchesSelection: false,
      })
    ).toBe(true)
  })
})
