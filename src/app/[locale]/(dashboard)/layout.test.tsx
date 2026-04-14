import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE_PATH = path.resolve(
  process.cwd(),
  'src/app/[locale]/(dashboard)/layout.tsx'
)
const SHELL_DATA_PATH = path.resolve(process.cwd(), 'src/lib/dashboard/shell-data.ts')

describe('DashboardLayout onboarding bot unlock source', () => {
  it('loads dashboard chrome data through one request-scoped shell loader', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')
    const shellDataSource = fs.readFileSync(SHELL_DATA_PATH, 'utf8')

    expect(source).toContain('getDashboardShellData')
    expect(source).not.toContain('getOrgAiSettings(')
    expect(source).not.toContain('getOrganizationBillingSnapshot(')
    expect(source).not.toContain('getOrganizationOnboardingState(')
    expect(shellDataSource).toContain('cache(')
    expect(shellDataSource).toContain('getOrgAiSettings')
    expect(shellDataSource).toContain('getOrganizationOnboardingShellData')
    expect(source).toContain('OnboardingCompletionModal')
    expect(source).toContain('requiresExplicitSelection')
    expect(source).toContain('shellData.onboardingState?.isComplete')
  })

  it('passes the modal an explicit post-onboarding choice requirement instead of only the raw lock flag', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).toContain('requiresExplicitSelection')
  })
})
