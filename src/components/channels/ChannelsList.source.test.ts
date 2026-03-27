import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CHANNELS_LIST_PATH = path.resolve(process.cwd(), 'src/components/channels/ChannelsList.tsx')

describe('ChannelsList source guards', () => {
  it('keeps prefetch work keyed off stable memoized hrefs', () => {
    const source = fs.readFileSync(CHANNELS_LIST_PATH, 'utf8')

    expect(source).toContain('useMemo')
    expect(source).toContain('const channelPrefetchHrefs = useMemo(')
    expect(source).toContain('channelPrefetchHrefs.forEach((href) => {')
    expect(source).not.toContain('}, [channelCards, locale, router])')
  })
})
