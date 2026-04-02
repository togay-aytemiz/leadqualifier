import { getChannels } from '@/lib/channels/actions'
import { shouldCountChannelAsConnected } from '@/lib/channels/connection-readiness'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChannelsList } from '@/components/channels/ChannelsList'
import { ChannelsOnboardingLockBanner } from '@/components/channels/ChannelsOnboardingLockBanner'
import { PageHeader } from '@/design'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import {
    getOrganizationOnboardingState,
    isChannelConnectionPrerequisitesComplete
} from '@/lib/onboarding/state'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

export default async function ChannelsPage() {
    const locale = await getLocale()
    const tChannels = await getTranslations('Channels')

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{tChannels('noOrganization')}</h2>
                    <p>{tChannels('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: '/settings/channels',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const [channels, onboardingState] = await Promise.all([
        getChannels(organizationId),
        getOrganizationOnboardingState(organizationId)
    ])
    const totalChannels = 4
    const connectedChannels = (channels || []).filter(channel => shouldCountChannelAsConnected(channel)).length
    const isChannelConnectionLocked = !isChannelConnectionPrerequisitesComplete(onboardingState.steps)

    return (
        <>
            <PageHeader title={tChannels('title')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="w-full">
                    {isChannelConnectionLocked && (
                        <ChannelsOnboardingLockBanner
                            className="mb-5"
                            message={tChannels('channelConnectionLocked.message')}
                            description={tChannels('channelConnectionLocked.description')}
                            ctaLabel={tChannels('channelConnectionLocked.goToOnboarding')}
                            ctaHref="/onboarding"
                        />
                    )}

                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-500">
                            {tChannels('description')}
                        </p>
                        <p className="text-sm font-medium text-slate-500">
                            {tChannels('summary', { connected: connectedChannels, total: totalChannels })}
                        </p>
                    </div>

                    <ChannelsList
                        channels={channels || []}
                        organizationId={organizationId}
                        showDescription={false}
                        isReadOnly={orgContext?.readOnlyTenantMode ?? false}
                        isChannelConnectionLocked={isChannelConnectionLocked}
                    />
                </div>
            </div>
        </>
    )
}
