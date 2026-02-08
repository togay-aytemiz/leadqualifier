import { createClient } from '@/lib/supabase/server'
import { getChannels } from '@/lib/channels/actions'
import { getTranslations } from 'next-intl/server'
import { ChannelsList } from '@/components/channels/ChannelsList'
import { PageHeader, Button } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

export default async function ChannelsPage() {
    const supabase = await createClient()
    const tChannels = await getTranslations('Channels')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const orgContext = await resolveActiveOrganizationContext(supabase)
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

    const channels = await getChannels(organizationId)
    const totalChannels = 2
    const connectedChannels = (channels || []).filter(channel => channel.status === 'active').length

    return (
        <>
            <PageHeader
                title={tChannels('title')}
                actions={
                    <Button disabled>
                        {tChannels('save')}
                    </Button>
                }
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl">
                    <SettingsSection
                        title={tChannels('title')}
                        description={tChannels('description')}
                        summary={tChannels('summary', { connected: connectedChannels, total: totalChannels })}
                        layout="wide"
                    >
                        <ChannelsList
                            channels={channels || []}
                            organizationId={organizationId}
                            showDescription={false}
                            isReadOnly={orgContext?.readOnlyTenantMode ?? false}
                        />
                    </SettingsSection>
                </div>
            </div>
        </>
    )
}
