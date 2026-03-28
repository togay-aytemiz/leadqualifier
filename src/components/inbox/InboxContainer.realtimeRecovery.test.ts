import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INBOX_CONTAINER_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')

describe('InboxContainer realtime recovery source guards', () => {
  it('reconciles inbox state on browser resume and broken realtime channel states', () => {
    const source = fs.readFileSync(INBOX_CONTAINER_PATH, 'utf8')

    expect(source).toContain('attachInboxRealtimeRecoveryListeners({')
    expect(source).toContain('const resyncInboxState = useCallback(')
    expect(source).toContain('if (shouldRecoverInboxRealtime(status)) {')
  })
})
