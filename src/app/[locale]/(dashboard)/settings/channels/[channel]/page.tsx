import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

import { ChannelPlaceholderOnboardingPage } from '@/components/channels/ChannelPlaceholderOnboardingPage'
import { getChannelCatalogEntry, type ChannelCardType } from '@/components/channels/channelCatalog'
import { TelegramOnboardingPage } from '@/components/channels/TelegramOnboardingPage'
import { WhatsAppOnboardingPage } from '@/components/channels/WhatsAppOnboardingPage'
import { getChannels } from '@/lib/channels/actions'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

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

    const channels = await getChannels(organizationId)
    const selectedChannel = catalogEntry.type === 'messenger'
        ? undefined
        : channels.find((item) => item.type === catalogEntry.type)
    const isReadOnly = orgContext?.readOnlyTenantMode ?? false

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

    return (
        <ChannelPlaceholderOnboardingPage
            type={catalogEntry.type}
            channel={selectedChannel}
        />
    )
}
