import { describe, expect, it, vi } from 'vitest'

import type { OrganizationOnboardingShellState } from '@/lib/onboarding/state'

import {
  dispatchOnboardingStateUpdated,
  listenForOnboardingStateUpdates,
  shouldApplyOnboardingStateUpdate,
} from './events'

function createOnboardingState(
  overrides?: Partial<OrganizationOnboardingShellState>
): OrganizationOnboardingShellState {
  return {
    organizationId: 'org-1',
    isComplete: false,
    completedSteps: 4,
    totalSteps: 5,
    showBanner: true,
    showChecklistCta: true,
    showNavigationEntry: true,
    shouldAutoOpen: false,
    steps: [],
    ...overrides,
  }
}

describe('onboarding state events', () => {
  it('dispatches fresh onboarding state snapshots to shell listeners', () => {
    const target = new EventTarget()
    const listener = vi.fn()
    const onboardingState = createOnboardingState()

    const unsubscribe = listenForOnboardingStateUpdates(listener, target)

    dispatchOnboardingStateUpdated({ organizationId: ' org-1 ', onboardingState }, target)

    expect(listener).toHaveBeenCalledWith({
      organizationId: 'org-1',
      onboardingState,
    })

    unsubscribe()
    dispatchOnboardingStateUpdated(
      { organizationId: 'org-1', onboardingState: createOnboardingState({ completedSteps: 5 }) },
      target
    )

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('applies sidebar updates only for the active organization and a usable snapshot', () => {
    const onboardingState = createOnboardingState()

    expect(
      shouldApplyOnboardingStateUpdate('org-1', { organizationId: 'org-1', onboardingState })
    ).toBe(true)
    expect(
      shouldApplyOnboardingStateUpdate('org-1', { organizationId: null, onboardingState })
    ).toBe(true)
    expect(
      shouldApplyOnboardingStateUpdate('org-1', { organizationId: 'org-2', onboardingState })
    ).toBe(false)
    expect(
      shouldApplyOnboardingStateUpdate('org-1', { organizationId: 'org-1', onboardingState: null })
    ).toBe(false)
    expect(
      shouldApplyOnboardingStateUpdate(null, { organizationId: 'org-1', onboardingState })
    ).toBe(false)
  })
})
