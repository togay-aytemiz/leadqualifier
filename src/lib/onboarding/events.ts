import type { OrganizationOnboardingShellState } from '@/lib/onboarding/state'

export const ONBOARDING_STATE_UPDATED_EVENT = 'onboarding-state-updated'

export interface OnboardingStateUpdatedDetail {
  organizationId?: string | null
  onboardingState?: OrganizationOnboardingShellState | null
}

type OnboardingStateEventTarget = Pick<
  EventTarget,
  'addEventListener' | 'removeEventListener' | 'dispatchEvent'
>

function normalizeOrganizationId(organizationId: string | null | undefined) {
  if (typeof organizationId !== 'string') return null
  const trimmed = organizationId.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveEventTarget(target?: OnboardingStateEventTarget | null) {
  if (target) return target
  if (typeof window === 'undefined') return null
  return window
}

function isOnboardingState(value: unknown): value is OrganizationOnboardingShellState {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<OrganizationOnboardingShellState>
  return (
    typeof candidate.organizationId === 'string' &&
    typeof candidate.completedSteps === 'number' &&
    typeof candidate.totalSteps === 'number' &&
    Array.isArray(candidate.steps)
  )
}

function normalizeOnboardingState(value: unknown) {
  return isOnboardingState(value) ? value : null
}

export function shouldApplyOnboardingStateUpdate(
  currentOrganizationId: string | null | undefined,
  detail?: OnboardingStateUpdatedDetail | null
) {
  const normalizedCurrent = normalizeOrganizationId(currentOrganizationId)
  if (!normalizedCurrent) return false

  const onboardingState = normalizeOnboardingState(detail?.onboardingState)
  if (!onboardingState) return false

  const detailOrganizationId = normalizeOrganizationId(detail?.organizationId)
  const stateOrganizationId = normalizeOrganizationId(onboardingState.organizationId)
  const eventOrganizationId = detailOrganizationId ?? stateOrganizationId

  return !eventOrganizationId || eventOrganizationId === normalizedCurrent
}

export function dispatchOnboardingStateUpdated(
  detail?: OnboardingStateUpdatedDetail | null,
  target?: OnboardingStateEventTarget | null
) {
  const resolvedTarget = resolveEventTarget(target)
  if (!resolvedTarget) return

  resolvedTarget.dispatchEvent(
    new CustomEvent<OnboardingStateUpdatedDetail>(ONBOARDING_STATE_UPDATED_EVENT, {
      detail: {
        organizationId: normalizeOrganizationId(detail?.organizationId),
        onboardingState: normalizeOnboardingState(detail?.onboardingState),
      },
    })
  )
}

export function listenForOnboardingStateUpdates(
  listener: (detail: OnboardingStateUpdatedDetail) => void,
  target?: OnboardingStateEventTarget | null
) {
  const resolvedTarget = resolveEventTarget(target)
  if (!resolvedTarget) {
    return () => {}
  }

  const handler = (event: Event) => {
    const detail =
      event instanceof CustomEvent
        ? (event.detail as OnboardingStateUpdatedDetail | null | undefined)
        : null

    listener({
      organizationId: normalizeOrganizationId(detail?.organizationId),
      onboardingState: normalizeOnboardingState(detail?.onboardingState),
    })
  }

  resolvedTarget.addEventListener(ONBOARDING_STATE_UPDATED_EVENT, handler)
  return () => resolvedTarget.removeEventListener(ONBOARDING_STATE_UPDATED_EVENT, handler)
}
