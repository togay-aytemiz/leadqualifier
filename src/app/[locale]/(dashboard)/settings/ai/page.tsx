import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { Sidebar, SidebarGroup, SidebarItem } from '@/design'
import { FaRegCreditCard } from 'react-icons/fa'
import { ImBubbles4 } from 'react-icons/im'
import { LuBriefcaseBusiness, LuCircleUser, LuReceipt, LuSettings2, LuWandSparkles } from 'react-icons/lu'
import AiSettingsClient from './AiSettingsClient'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'

export default async function AiSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tSidebar = await getTranslations('Sidebar')
    const tAi = await getTranslations('aiSettings')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    const organizationId = membership?.organization_id

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
        getOrgAiSettings(organizationId, { supabase }),
        getPendingOfferingProfileSuggestionCount(organizationId, locale)
    ])

    return (
        <>
            {/* Inner Sidebar */}
            <Sidebar title={tSidebar('settings')}>
                <SidebarGroup title={tSidebar('preferences')}>
                    <SidebarItem
                        icon={<LuCircleUser size={18} />}
                        label={tSidebar('profile')}
                        href={locale === 'tr' ? '/settings/profile' : `/${locale}/settings/profile`}
                    />
                    <SidebarItem
                        icon={<LuBriefcaseBusiness size={18} />}
                        label={tSidebar('organization')}
                        href={locale === 'tr' ? '/settings/organization' : `/${locale}/settings/organization`}
                        indicator={pendingCount > 0}
                    />
                    <SidebarItem
                        icon={<LuSettings2 size={18} />}
                        label={tSidebar('general')}
                        href={locale === 'tr' ? '/settings/general' : `/${locale}/settings/general`}
                    />
                    <SidebarItem icon={<LuWandSparkles size={18} />} label={tSidebar('ai')} active />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('integrations')}>
                    <SidebarItem
                        icon={<ImBubbles4 size={18} />}
                        label={tSidebar('channels')}
                        href={locale === 'tr' ? '/settings/channels' : `/${locale}/settings/channels`}
                    />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('billing')}>
                    <SidebarItem icon={<FaRegCreditCard size={18} />} label={tSidebar('plans')} />
                    <SidebarItem
                        icon={<LuReceipt size={18} />}
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
