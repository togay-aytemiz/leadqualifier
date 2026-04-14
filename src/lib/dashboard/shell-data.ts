import { cache } from 'react'
import { getLocale } from 'next-intl/server'
import { getOrgAiSettings } from '@/lib/ai/settings'
import {
    DASHBOARD_SHELL_MESSAGE_NAMESPACES,
    getScopedMessages
} from '@/i18n/messages'
import {
    getOrganizationOnboardingShellData,
    type OrganizationOnboardingShellState
} from '@/lib/onboarding/state'
import {
    resolveActiveOrganizationContext,
    type ActiveOrganizationContext
} from '@/lib/organizations/active-context'
import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import { withDevTiming } from '@/lib/performance/timing'

type DashboardShellMessages = Awaited<ReturnType<typeof getScopedMessages>>
type DashboardShellAiSettings = Awaited<ReturnType<typeof getOrgAiSettings>>

export interface DashboardShellData {
    locale: string
    messages: DashboardShellMessages
    orgContext: ActiveOrganizationContext | null
    billingSnapshot: OrganizationBillingSnapshot | null
    onboardingState: OrganizationOnboardingShellState | null
    aiSettings: DashboardShellAiSettings | null
}

export const getDashboardShellData = cache(async (): Promise<DashboardShellData> => {
    const [locale, orgContext] = await Promise.all([
        getLocale(),
        withDevTiming('dashboard.layout.orgContext', () => resolveActiveOrganizationContext())
    ])

    const messagesPromise = withDevTiming(
        'dashboard.layout.messages',
        () => getScopedMessages(locale, DASHBOARD_SHELL_MESSAGE_NAMESPACES)
    )
    const onboardingOrganizationId = orgContext?.readOnlyTenantMode
        ? null
        : (orgContext?.activeOrganizationId ?? null)
    const onboardingShellData = onboardingOrganizationId
        ? await withDevTiming(
            'dashboard.layout.billingAndOnboarding',
            () => getOrganizationOnboardingShellData(onboardingOrganizationId)
        )
        : {
            billingSnapshot: null,
            onboardingState: null
        }
    const aiSettings = onboardingOrganizationId
        ? await withDevTiming(
            'dashboard.layout.aiSettings',
            () => getOrgAiSettings(onboardingOrganizationId, {
                locale,
                onboardingState: onboardingShellData.onboardingState
            })
        )
        : null
    const messages = await messagesPromise

    return {
        locale,
        messages,
        orgContext,
        billingSnapshot: onboardingShellData.billingSnapshot,
        onboardingState: onboardingShellData.onboardingState,
        aiSettings
    }
})
