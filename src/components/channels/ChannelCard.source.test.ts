import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CHANNEL_CARD_PATH = path.resolve(process.cwd(), 'src/components/channels/ChannelCard.tsx')

describe('ChannelCard source guards', () => {
  it('disables fresh connection actions when channel connection is onboarding-locked', () => {
    const source = fs.readFileSync(CHANNEL_CARD_PATH, 'utf8')

    expect(source).toContain('isConnectLocked')
    expect(source).toContain('disabled={isReadOnly || isConnectLocked}')
    expect(source).toContain("!isConnectLocked && 'hover:-translate-y-0.5 hover:shadow-md'")
  })
})
