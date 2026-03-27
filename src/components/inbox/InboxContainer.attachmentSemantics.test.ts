import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INBOX_CONTAINER_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')

describe('InboxContainer attachment semantics source guards', () => {
  it('does not render nested pseudo-buttons inside attachment preview controls', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain("aria-label={t('composerAttachments.remove')}")
    expect(source).not.toContain('role="button"')
  })
})
