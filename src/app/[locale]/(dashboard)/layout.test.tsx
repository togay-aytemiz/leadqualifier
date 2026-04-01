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
    expect(source).toContain('botModeUnlockRequired')
    expect(source).toContain('onboardingState?.isComplete')
  })
})
