import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INBOX_CONTAINER_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')

describe('InboxContainer preview sync source guards', () => {
  it('syncs sidebar previews from fetched thread history and stale conversation updates', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('const nextPreviewMessages = buildConversationPreviewMessages(pageResult.messages)')
    expect(source).toContain('void refreshConversationPreview(newOrUpdatedConv.id)')
    expect(source).toContain('const mergedConversationResult = mergeRealtimeConversationUpdate({')
  })
})
