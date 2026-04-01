import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getOrganizationOnboardingState } from '@/lib/onboarding/state'

import { OnboardingPageClient } from '@/components/onboarding/OnboardingPageClient'

export default async function OnboardingPage() {
  const orgContext = await resolveActiveOrganizationContext()
  const organizationId = orgContext?.readOnlyTenantMode
    ? null
    : (orgContext?.activeOrganizationId ?? null)

  if (!organizationId) {
    return null
  }

  const onboardingState = await getOrganizationOnboardingState(organizationId)

  return (
    <OnboardingPageClient
      organizationId={organizationId}
      onboardingState={onboardingState}
      shouldMarkSeenOnMount={onboardingState.shouldAutoOpen}
      isReadOnly={orgContext?.readOnlyTenantMode ?? false}
      userName={orgContext?.userFullName || orgContext?.userEmail || null}
    />
  )
}
