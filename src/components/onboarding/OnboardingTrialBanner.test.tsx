import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ONBOARDING_TRIAL_BANNER_PATH = path.resolve(
  process.cwd(),
  'src/components/onboarding/OnboardingTrialBanner.tsx'
)

describe('OnboardingTrialBanner source', () => {
  it('keeps desktop actions separate while using an inline text-based upgrade CTA on mobile', () => {
    const source = fs.readFileSync(ONBOARDING_TRIAL_BANNER_PATH, 'utf8')

    expect(source).toContain('/onboarding')
    expect(source).toContain('/settings/plans')
    expect(source).toContain("t.rich('mobileMessage'")
    expect(source).toContain('sm:hidden')
    expect(source).toContain('hidden flex-wrap')
    expect(source).toContain('sm:flex')
    expect(source).toContain('underline underline-offset-4')
  })

  it('renders the checklist CTA conditionally from shared onboarding state', () => {
    const source = fs.readFileSync(ONBOARDING_TRIAL_BANNER_PATH, 'utf8')

    expect(source).toContain('showChecklistCta')
    expect(source).toContain("useTranslations('onboarding.banner')")
    expect(source).toContain("t.rich('message'")
    expect(source).toContain("t.rich('mobileMessage'")
    expect(source).toContain('font-semibold')
    expect(source).not.toContain('rounded-full bg-blue-600 text-white')
    expect(source).not.toContain("useEffect(() => {")
    expect(source).not.toContain(".from('organization_onboarding_states')")
  })
})
