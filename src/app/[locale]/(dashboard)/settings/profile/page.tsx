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
import ProfileSettingsClient from './ProfileSettingsClient'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

export default async function ProfileSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tSidebar = await getTranslations('Sidebar')
    const tProfile = await getTranslations('profileSettings')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const [{ data: profile }, orgContext] = await Promise.all([
        supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .single(),
        resolveActiveOrganizationContext(supabase)
    ])

    const initialName = profile?.full_name ?? ''
    const email = profile?.email ?? user.email ?? ''
    const pendingCount = orgContext?.activeOrganizationId
        ? await getPendingOfferingProfileSuggestionCount(orgContext.activeOrganizationId, locale)
        : 0

    return (
        <>
            <Sidebar title={tSidebar('settings')}>
                <SidebarGroup title={tSidebar('preferences')}>
                    <SidebarItem icon={<HiOutlineUserCircle size={18} />} label={tSidebar('profile')} active />
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

            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <ProfileSettingsClient initialName={initialName} email={email} />
            </div>
        </>
    )
}
