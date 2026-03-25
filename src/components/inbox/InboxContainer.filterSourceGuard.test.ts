import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INBOX_CONTAINER_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')

describe('InboxContainer filter menu source guards', () => {
  it('wires the title-row filter menu and list filter helper into the inbox list flow', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('InboxListFilterMenu')
    expect(source).toContain('applyInboxListFilters({')
  })

  it('marks a conversation read when manually switching away, not when opening it', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('const previousSelectedId = selectedIdRef.current')
    expect(source).toContain('void commitConversationRead(previousSelectedId)')
    expect(source).not.toContain('void markConversationRead(nextId)')
  })
})
