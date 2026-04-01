import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ONBOARDING_TRIAL_BANNER_PATH = path.resolve(
  process.cwd(),
  'src/components/onboarding/OnboardingTrialBanner.tsx'
)

describe('OnboardingTrialBanner source', () => {
  it('shows both onboarding and upgrade actions with responsive wrapping and centered alignment', () => {
    const source = fs.readFileSync(ONBOARDING_TRIAL_BANNER_PATH, 'utf8')

    expect(source).toContain('/onboarding')
    expect(source).toContain('/settings/plans')
    expect(source).toContain('flex-wrap')
    expect(source).toContain('items-center')
  })

  it('renders the checklist CTA conditionally from shared onboarding state', () => {
    const source = fs.readFileSync(ONBOARDING_TRIAL_BANNER_PATH, 'utf8')

    expect(source).toContain('showChecklistCta')
    expect(source).toContain("useTranslations('onboarding.banner')")
    expect(source).toContain("t.rich('message'")
    expect(source).toContain('font-semibold')
    expect(source).not.toContain("useEffect(() => {")
    expect(source).not.toContain(".from('organization_onboarding_states')")
  })
})
