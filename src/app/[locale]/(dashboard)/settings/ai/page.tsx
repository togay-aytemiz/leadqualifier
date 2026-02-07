import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { Sidebar, SidebarGroup, SidebarItem } from '@/design'
import {
    HiOutlineUserCircle,
    HiOutlineBriefcase,
    HiOutlineAdjustmentsHorizontal,
    HiOutlineSparkles,
    HiOutlineChatBubbleLeftRight,
    HiOutlineCreditCard,
    HiOutlineBanknotes
} from 'react-icons/hi2'
import AiSettingsClient from './AiSettingsClient'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

export default async function AiSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tSidebar = await getTranslations('Sidebar')
    const tAi = await getTranslations('aiSettings')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const orgContext = await resolveActiveOrganizationContext(supabase)
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{tAi('noOrganization')}</h2>
                    <p>{tAi('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    const [aiSettings, pendingCount] = await Promise.all([
        getOrgAiSettings(organizationId, { supabase, locale }),
        getPendingOfferingProfileSuggestionCount(organizationId, locale)
    ])

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
                    <SidebarItem icon={<HiOutlineSparkles size={18} />} label={tSidebar('ai')} active />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('integrations')}>
                    <SidebarItem
                        icon={<HiOutlineChatBubbleLeftRight size={18} />}
                        label={tSidebar('channels')}
                        href={locale === 'tr' ? '/settings/channels' : `/${locale}/settings/channels`}
                    />
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
                <AiSettingsClient initialSettings={aiSettings} />
            </div>
        </>
    )
}
