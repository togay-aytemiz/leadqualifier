import { createClient } from '@/lib/supabase/server'
import { getChannels } from '@/lib/channels/actions'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChannelsList } from '@/components/channels/ChannelsList'
import { Sidebar, SidebarGroup, SidebarItem, PageHeader, Button } from '@/design'
import {
    HiOutlineUserCircle,
    HiOutlineBriefcase,
    HiOutlineAdjustmentsHorizontal,
    HiOutlineSparkles,
    HiOutlineChatBubbleLeftRight,
    HiOutlineCreditCard,
    HiOutlineBanknotes
} from 'react-icons/hi2'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

export default async function ChannelsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tSidebar = await getTranslations('Sidebar')
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

    const [channels, pendingCount] = await Promise.all([
        getChannels(organizationId),
        getPendingOfferingProfileSuggestionCount(organizationId, locale)
    ])
    const totalChannels = 2
    const connectedChannels = (channels || []).filter(channel => channel.status === 'active').length

    return (
        <>
            {/* Inner Sidebar */}
            <Sidebar title={tSidebar('settings')}>
                <SidebarGroup title={tSidebar('preferences')}>
                    <SidebarItem
                        icon={<HiOutlineUserCircle size={18} />}
                        label={tSidebar('profile')}
                        href={locale === 'tr' ? '/settings/profile' : `/${locale}/settings/profile`}
                    />
                    <SidebarItem
                        icon={<HiOutlineBriefcase size={18} />}
                        label={tSidebar('organization')}
                        href={locale === 'tr' ? '/settings/organization' : `/${locale}/settings/organization`}
                        indicator={pendingCount > 0}
                    />
                    <SidebarItem
                        icon={<HiOutlineAdjustmentsHorizontal size={18} />}
                        label={tSidebar('general')}
                        href={locale === 'tr' ? '/settings/general' : `/${locale}/settings/general`}
                    />
                    <SidebarItem
                        icon={<HiOutlineSparkles size={18} />}
                        label={tSidebar('ai')}
                        href={locale === 'tr' ? '/settings/ai' : `/${locale}/settings/ai`}
                    />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('integrations')}>
                    <SidebarItem icon={<HiOutlineChatBubbleLeftRight size={18} />} label={tSidebar('channels')} active />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('billing')}>
                    <SidebarItem icon={<HiOutlineCreditCard size={18} />} label={tSidebar('plans')} />
                    <SidebarItem
                        icon={<HiOutlineBanknotes size={18} />}
                        label={tSidebar('receipts')}
                        href={locale === 'tr' ? '/settings/billing' : `/${locale}/settings/billing`}
                    />
                </SidebarGroup>
            </Sidebar>

            {/* Main Content */}
            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
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
            </div>
        </>
    )
}
