import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN_SIDEBAR_PATH = path.resolve(process.cwd(), 'src/design/MainSidebar.tsx')

describe('MainSidebar onboarding source', () => {
  it('adds onboarding as a highlighted top card ahead of the workspace links', () => {
    const source = fs.readFileSync(MAIN_SIDEBAR_PATH, 'utf8')

    expect(source).toContain('effectiveOnboardingState?.showNavigationEntry')
    expect(source).toContain('listenForOnboardingStateUpdates')
    expect(source).toContain('shouldApplyOnboardingStateUpdate')
    expect(source).toContain('effectiveOnboardingState')
    expect(source).toContain('onboardingHighlightProgressLabel')
    expect(source).toContain('effectiveOnboardingState.completedSteps')
    expect(source).toContain('effectiveOnboardingState.totalSteps')
    expect(source).toContain('href="/onboarding"')
    expect(source).toContain('from-violet-50')
    expect(source).not.toContain('{onboardingState.completedSteps}/{onboardingState.totalSteps}')
    expect(source).not.toContain('rounded-2xl border border-violet-200 bg-white/90')
  })

  it('locks bot quick switch behind onboarding completion when required', () => {
    const source = fs.readFileSync(MAIN_SIDEBAR_PATH, 'utf8')

    expect(source).toContain('bot_mode_unlock_required')
    expect(source).toContain('botStatusQuickSwitchOnboardingLocked')
    expect(source).toContain('border-violet-200 bg-violet-50')
    expect(source).toContain('flex items-center gap-2')
    expect(source.match(/botModeQuickSwitchHelperText/g)).toHaveLength(2)
    expect(source).toContain("!canQuickSwitchBotMode && 'cursor-not-allowed opacity-80'")
    expect(source).toContain(".select('bot_mode, bot_mode_unlock_required')")
  })
})
