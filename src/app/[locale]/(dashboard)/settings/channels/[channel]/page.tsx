import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

import { ChannelPlaceholderOnboardingPage } from '@/components/channels/ChannelPlaceholderOnboardingPage'
import { ChannelOnboardingShell } from '@/components/channels/ChannelOnboardingShell'
import { getChannelCatalogEntry, type ChannelCardType } from '@/components/channels/channelCatalog'
import { ChannelsOnboardingLockBanner } from '@/components/channels/ChannelsOnboardingLockBanner'
import { InstagramOnboardingPage } from '@/components/channels/InstagramOnboardingPage'
import { TelegramOnboardingPage } from '@/components/channels/TelegramOnboardingPage'
import { WhatsAppOnboardingPage } from '@/components/channels/WhatsAppOnboardingPage'
import { getChannels } from '@/lib/channels/actions'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import {
    getOrganizationOnboardingState,
    isChannelConnectionPrerequisitesComplete
} from '@/lib/onboarding/state'
import Link from 'next/link'

function getLocalizedHref(locale: string, href: string) {
    if (locale === 'tr') return href
    return `/${locale}${href}`
}

interface ChannelSetupPageProps {
    params: Promise<{
        channel: string
    }>
}

export default async function ChannelSetupPage({ params }: ChannelSetupPageProps) {
    const { channel: channelParam } = await params
    const locale = await getLocale()
    const tChannels = await getTranslations('Channels')
    const orgContext = await resolveActiveOrganizationContext()
    const organizationId = orgContext?.activeOrganizationId ?? null

    const catalogEntry = getChannelCatalogEntry(channelParam as ChannelCardType)
    if (!catalogEntry) {
        notFound()
    }

    if (!organizationId) {
        return (
            <div className="flex flex-1 items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="mb-2 text-xl font-bold text-gray-900">{tChannels('noOrganization')}</h2>
                    <p>{tChannels('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: `/settings/channels/${channelParam}`,
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const [channels, onboardingState] = await Promise.all([
        getChannels(organizationId),
        getOrganizationOnboardingState(organizationId)
    ])
    const selectedChannel = catalogEntry.type === 'messenger'
        ? undefined
        : channels.find((item) => item.type === catalogEntry.type)
    const isReadOnly = orgContext?.readOnlyTenantMode ?? false
    const isChannelConnectionLocked = !isChannelConnectionPrerequisitesComplete(onboardingState.steps)

    if (!selectedChannel && isChannelConnectionLocked && catalogEntry.onboardingSurface === 'interactive') {
        const channelTitle = tChannels(`types.${catalogEntry.type}`)

        return (
            <ChannelOnboardingShell
                channelType={catalogEntry.type}
                pageTitle={tChannels('onboarding.pageTitle', { channel: channelTitle })}
                backHref={getLocalizedHref(locale, '/settings/channels')}
                backLabel={tChannels('onboarding.back')}
                banner={
                    <ChannelsOnboardingLockBanner
                        message={tChannels('channelConnectionLocked.message')}
                        description={tChannels('channelConnectionLocked.description')}
                        ctaLabel={tChannels('channelConnectionLocked.goToOnboarding')}
                        ctaHref={getLocalizedHref(locale, '/onboarding')}
                    />
                }
            >
                <div className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-sm">
                    <p className="text-sm leading-7 text-slate-600">
                        {tChannels('channelConnectionLocked.pageDescription', { channel: channelTitle })}
                    </p>
                    <div className="mt-4">
                        <Link
                            href={getLocalizedHref(locale, '/onboarding')}
                            className="inline-flex h-10 items-center justify-center rounded-lg border border-violet-600 bg-violet-600 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-700"
                        >
                            {tChannels('channelConnectionLocked.goToOnboarding')}
                        </Link>
                    </div>
                </div>
            </ChannelOnboardingShell>
        )
    }

    if (catalogEntry.type === 'whatsapp') {
        return (
            <WhatsAppOnboardingPage
                organizationId={organizationId}
                channel={selectedChannel}
                isReadOnly={isReadOnly}
            />
        )
    }

    if (catalogEntry.type === 'telegram') {
        return (
            <TelegramOnboardingPage
                organizationId={organizationId}
                channel={selectedChannel}
                isReadOnly={isReadOnly}
            />
        )
    }

    if (catalogEntry.type === 'instagram') {
        return (
            <InstagramOnboardingPage
                organizationId={organizationId}
                channel={selectedChannel}
                isReadOnly={isReadOnly}
            />
        )
    }

    return (
        <ChannelPlaceholderOnboardingPage
            type={catalogEntry.type}
            channel={selectedChannel}
        />
    )
}
