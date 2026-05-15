import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE_PATH = path.resolve(
  process.cwd(),
  'src/components/onboarding/OnboardingCompletionModal.tsx'
)

describe('OnboardingCompletionModal source', () => {
  it('renders the three explicit bot-mode choices and uses the unlock action', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).toContain("useTranslations('onboarding.completionModal')")
    expect(source).toContain('completeOrganizationOnboardingBotModeUnlock')
    expect(source).toContain("selectedMode: 'active'")
    expect(source).toContain("selectedMode: 'shadow'")
    expect(source).toContain("selectedMode: 'off'")
    expect(source).toContain('router.refresh()')
  })

  it('does not allow a dismiss-only escape hatch', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).not.toContain('onClose={() => setIsOpen(false)}')
    expect(source).not.toContain('dismissText')
  })

  it('keeps the bot-mode options neutral instead of recommending listener mode', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).not.toContain('recommended')
    expect(source).not.toContain('Recommended')
    expect(source).not.toContain('öner')
    expect(source).not.toContain('badge:')
  })

  it('puts active first and colors each choice with the sidebar bot-mode tones', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    const activeIndex = source.indexOf("key: 'active'")
    const shadowIndex = source.indexOf("key: 'shadow'")
    const offIndex = source.indexOf("key: 'off'")

    expect(activeIndex).toBeGreaterThan(-1)
    expect(shadowIndex).toBeGreaterThan(activeIndex)
    expect(offIndex).toBeGreaterThan(shadowIndex)
    expect(source).toContain("tone: 'emerald'")
    expect(source).toContain("tone: 'amber'")
    expect(source).toContain("tone: 'rose'")
    expect(source).toContain('border-emerald-200 bg-emerald-50')
    expect(source).toContain('border-amber-200 bg-amber-50')
    expect(source).toContain('border-rose-200 bg-rose-50')
  })
})
