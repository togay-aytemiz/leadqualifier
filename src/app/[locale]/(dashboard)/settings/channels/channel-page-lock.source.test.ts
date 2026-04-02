import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CHANNEL_PAGE_PATH = path.resolve(
  process.cwd(),
  'src/app/[locale]/(dashboard)/settings/channels/[channel]/page.tsx'
)

describe('settings channel setup page source', () => {
  it('blocks unconnected channel setup flows until the first four getting-started steps are complete', () => {
    const source = fs.readFileSync(CHANNEL_PAGE_PATH, 'utf8')

    expect(source).toContain('getOrganizationOnboardingState')
    expect(source).toContain('isChannelConnectionPrerequisitesComplete')
    expect(source).toContain('!selectedChannel && isChannelConnectionLocked')
    expect(source).toContain('ChannelsOnboardingLockBanner')
  })
})
