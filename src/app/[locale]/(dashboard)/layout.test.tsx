import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE_PATH = path.resolve(
  process.cwd(),
  'src/app/[locale]/(dashboard)/layout.tsx'
)

describe('DashboardLayout onboarding bot unlock source', () => {
  it('loads ai settings once and renders the onboarding completion modal from shell state', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).toContain('getOrgAiSettings')
    expect(source).toContain('OnboardingCompletionModal')
    expect(source).toContain('requiresExplicitSelection')
    expect(source).toContain('onboardingState?.isComplete')
  })

  it('passes the modal an explicit post-onboarding choice requirement instead of only the raw lock flag', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).toContain('requiresExplicitSelection')
  })
})
