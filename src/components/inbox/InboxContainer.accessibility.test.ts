import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INBOX_CONTAINER_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')

describe('InboxContainer accessibility source guards', () => {
  it('names conversation rows and exposes selected state', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('resolveConversationRowLabel(c)')
    expect(source).toContain('aria-label={resolveConversationRowLabel(c)}')
    expect(source).toContain('aria-current={selectedId === c.id ? \'true\' : undefined}')
  })

  it('does not ship realtime debug console.log calls in the frontend container', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).not.toContain('console.log')
  })
})
