import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INBOX_CONTAINER_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')
const INBOX_PAGE_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/inbox/page.tsx')

describe('InboxContainer thread bootstrap source guards', () => {
  it('hydrates the selected thread from initial payload and keeps a conversation payload cache', () => {
    const containerSource = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')
    const pageSource = fs.readFileSync(INBOX_PAGE_PATH, 'utf8')

    expect(containerSource).toContain('initialThreadPayload')
    expect(containerSource).toContain('threadPayloadCacheRef')
    expect(containerSource).toContain('getConversationThreadPayload(')
    expect(containerSource).toContain('const cachedThreadPayload = threadPayloadCacheRef.current.get(selectedId)')
    expect(pageSource).not.toContain('getConversationThreadPayload(')
  })

  it('does not overwrite a previously loaded thread cache with the transient empty state from another selection', () => {
    const containerSource = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(containerSource).toContain('if (loadedConversationId !== selectedId) {')
    expect(containerSource).toContain('threadPayloadCacheRef.current.set(loadedConversationId, {')
  })

  it('does not trust an empty cached thread when the conversation list already has a preview message', () => {
    const containerSource = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(containerSource).toContain(
      'const selectedConversationPreviewMessage = resolveLatestNonSeenPreviewMessage('
    )
    expect(containerSource).toContain('threadPayloadCacheRef.current.delete(selectedId)')
  })

  it('supports leads deeplinks by seeding the requested conversation into inbox bootstrap state', () => {
    const containerSource = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')
    const pageSource = fs.readFileSync(INBOX_PAGE_PATH, 'utf8')

    expect(pageSource).toContain('searchParams')
    expect(pageSource).toContain('getConversationListItem(')
    expect(pageSource).toContain('initialSelectedConversationId={requestedConversationId}')
    expect(containerSource).toContain('initialSelectedConversationId?: string | null')
    expect(containerSource).toContain('initialSelectedConversationId ??')
  })
})
