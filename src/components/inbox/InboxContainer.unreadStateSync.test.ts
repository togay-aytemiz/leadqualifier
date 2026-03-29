import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INBOX_CONTAINER_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')

describe('InboxContainer unread state sync source guards', () => {
  it('publishes local unread state snapshots for shell consumers', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('dispatchInboxUnreadState')
    expect(source).toContain('let shouldPublishUnreadState = false')
    expect(source).toContain("newMsg.sender_type === 'contact' &&")
    expect(source).toContain('hasUnread: true')
  })
})
