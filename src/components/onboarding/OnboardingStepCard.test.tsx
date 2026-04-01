import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ONBOARDING_STEP_CARD_PATH = path.resolve(
  process.cwd(),
  'src/components/onboarding/OnboardingStepCard.tsx'
)

describe('OnboardingStepCard source', () => {
  it('keeps step content mounted and animates expand or collapse state', () => {
    const source = fs.readFileSync(ONBOARDING_STEP_CARD_PATH, 'utf8')

    expect(source).toContain('aria-hidden={!isExpanded}')
    expect(source).toContain('grid-rows-[1fr]')
    expect(source).toContain('grid-rows-[0fr]')
    expect(source).toContain('transition-[grid-template-rows,opacity]')
  })

  it('uses lighter respond-style status icons instead of wrapped todo circles', () => {
    const source = fs.readFileSync(ONBOARDING_STEP_CARD_PATH, 'utf8')

    expect(source).not.toContain('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border')
    expect(source).toContain('<CheckCircle2')
    expect(source).toContain('bg-violet-600 text-white')
    expect(source).not.toContain('<Circle')
  })
})
