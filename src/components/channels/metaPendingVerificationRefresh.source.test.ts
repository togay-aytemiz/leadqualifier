import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INSTAGRAM_PAGE_PATH = path.resolve(
  process.cwd(),
  'src/components/channels/InstagramOnboardingPage.tsx'
)
const WHATSAPP_PAGE_PATH = path.resolve(
  process.cwd(),
  'src/components/channels/WhatsAppOnboardingPage.tsx'
)

describe('Meta pending verification refresh source guards', () => {
  it('refreshes the Instagram onboarding page when the user returns after sending a verification message', () => {
    const source = fs.readFileSync(INSTAGRAM_PAGE_PATH, 'utf8')

    expect(source).toContain("connectionState !== 'pending'")
    expect(source).toContain('const connectedDescription = t(connectedCopy.descriptionKey')
    expect(source).toContain("t('gallery.pendingVerificationTitle')")
    expect(source).toContain("t('gallery.connectedAs', { name: channel.name })")
    expect(source).toContain("t('gallery.pendingVerificationDescription', {")
    expect(source).toContain('name: channel.name')
    expect(source).toContain('className="w-full"')
    expect(source).toContain("window.addEventListener('focus', refreshPendingChannel)")
    expect(source).toContain("document.addEventListener('visibilitychange', handleVisibilityChange)")
    expect(source).toContain('router.refresh()')
  })

  it('refreshes the WhatsApp onboarding page when the user returns after sending a verification message', () => {
    const source = fs.readFileSync(WHATSAPP_PAGE_PATH, 'utf8')

    expect(source).toContain("connectionState !== 'pending'")
    expect(source).toContain('const connectedDescription = t(connectedCopy.descriptionKey')
    expect(source).toContain("t('gallery.pendingVerificationTitle')")
    expect(source).toContain("t('gallery.connectedAs', {")
    expect(source).toContain("name: channel?.name ?? t('types.whatsapp')")
    expect(source).toContain("t('gallery.pendingVerificationDescription', {")
    expect(source).toContain('className="w-full"')
    expect(source).toContain("window.addEventListener('focus', refreshPendingChannel)")
    expect(source).toContain("document.addEventListener('visibilitychange', handleVisibilityChange)")
    expect(source).toContain('router.refresh()')
  })
})
