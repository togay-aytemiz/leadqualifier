import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INBOX_CONTAINER_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')

describe('InboxContainer filter menu source guards', () => {
  it('wires the title-row filter menu and list filter helper into the inbox list flow', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('InboxListFilterMenu')
    expect(source).toContain('applyInboxListFilters({')
    expect(source).toContain('activeConversationListFilters')
    expect(source).toContain('const loadConversationsPage = useCallback')
    expect(source).toContain('const nextConversations = await getConversations(')
    expect(source).toContain('CONVERSATIONS_PAGE_SIZE')
  })

  it('guards filtered backfill while a filter-change reload is resetting page 0', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('isResettingConversationListRef')
    expect(source).toContain('if (isResettingConversationListRef.current) return')
  })

  it('does not clear the server-bootstrapped list on mount when filters have not changed yet', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('buildConversationListFilterKey')
    expect(source).toContain('previousConversationListFilterKeyRef')
    expect(source).not.toContain('didMountConversationFiltersRef')
  })

  it('marks a conversation read when manually switching away, not when opening it', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('const previousSelectedId = selectedIdRef.current')
    expect(source).toContain('void commitConversationRead(previousSelectedId)')
    expect(source).not.toContain('void markConversationRead(nextId)')
  })

  it('uses a plain icon treatment for the selected-thread read toggle', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('onClick={handleToggleSelectedConversationUnread}')
    expect(source).toContain(
      'className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"'
    )
    expect(source).not.toContain('rounded-lg border border-gray-200 bg-gray-50 text-gray-600')
  })
})
