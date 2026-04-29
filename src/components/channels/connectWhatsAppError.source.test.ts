import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CONNECT_MODAL_PATH = path.resolve(process.cwd(), 'src/components/channels/ConnectWhatsAppModal.tsx')

describe('ConnectWhatsAppModal error localization source guards', () => {
  it('maps Meta SDK and timeout failures to localized copy instead of raw English errors', () => {
    const source = fs.readFileSync(CONNECT_MODAL_PATH, 'utf8')

    expect(source).toContain("t('whatsappConnect.metaSdkLoadFailed')")
    expect(source).toContain("t('whatsappConnect.embeddedSignupTimedOut')")
    expect(source).not.toContain("new Error('Meta SDK failed to load.')")
    expect(source).not.toContain("new Error('Timed out waiting for Meta embedded signup status.')")
  })
})
