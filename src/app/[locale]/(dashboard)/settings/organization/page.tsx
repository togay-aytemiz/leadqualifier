import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { Sidebar, SidebarGroup, SidebarItem } from '@/design'
import { FaRegCreditCard } from 'react-icons/fa'
import { ImBubbles4 } from 'react-icons/im'
import { LuBriefcaseBusiness, LuCircleUser, LuReceipt, LuSettings2, LuWandSparkles } from 'react-icons/lu'
import OrganizationSettingsClient from './OrganizationSettingsClient'
import { getOfferingProfile, getOfferingProfileSuggestions, getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'

export default async function OrganizationSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tSidebar = await getTranslations('Sidebar')
    const tOrg = await getTranslations('organizationSettings')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    const organizationId = membership?.organization_id

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{tOrg('noOrganization')}</h2>
                    <p>{tOrg('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    const [{ data: organization }, offeringProfile, offeringProfileSuggestions, pendingCount] = await Promise.all([
        supabase
            .from('organizations')
            .select('name')
            .eq('id', organizationId)
            .single(),
        getOfferingProfile(organizationId),
        getOfferingProfileSuggestions(organizationId, locale, { includeArchived: true }),
        getPendingOfferingProfileSuggestionCount(organizationId, locale)
    ])

    return (
        <>
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
                        active
                        indicator={pendingCount > 0}
                    />
                    <SidebarItem
                        icon={<LuSettings2 size={18} />}
                        label={tSidebar('general')}
                        href={locale === 'tr' ? '/settings/general' : `/${locale}/settings/general`}
                    />
                    <SidebarItem
                        icon={<LuWandSparkles size={18} />}
                        label={tSidebar('ai')}
                        href={locale === 'tr' ? '/settings/ai' : `/${locale}/settings/ai`}
                    />
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

            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <OrganizationSettingsClient
                    initialName={organization?.name ?? ''}
                    organizationId={organizationId}
                    offeringProfile={offeringProfile}
                    offeringProfileSuggestions={offeringProfileSuggestions}
                />
            </div>
        </>
    )
}
