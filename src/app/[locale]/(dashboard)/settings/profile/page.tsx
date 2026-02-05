import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import { Sidebar, SidebarGroup, SidebarItem } from '@/design'
import { FaRegCreditCard } from 'react-icons/fa'
import { ImBubbles4 } from 'react-icons/im'
import { LuBriefcaseBusiness, LuCircleUser, LuReceipt, LuSettings2, LuWandSparkles } from 'react-icons/lu'
import ProfileSettingsClient from './ProfileSettingsClient'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'

export default async function ProfileSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tSidebar = await getTranslations('Sidebar')
    const tProfile = await getTranslations('profileSettings')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .single(),
        supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .limit(1)
            .single()
    ])

    const initialName = profile?.full_name ?? ''
    const email = profile?.email ?? user.email ?? ''
    const pendingCount = membership?.organization_id
        ? await getPendingOfferingProfileSuggestionCount(membership.organization_id, locale)
        : 0

    return (
        <>
            <Sidebar title={tSidebar('settings')}>
                <SidebarGroup title={tSidebar('preferences')}>
                    <SidebarItem icon={<LuCircleUser size={18} />} label={tSidebar('profile')} active />
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
                <ProfileSettingsClient initialName={initialName} email={email} />
            </div>
        </>
    )
}
