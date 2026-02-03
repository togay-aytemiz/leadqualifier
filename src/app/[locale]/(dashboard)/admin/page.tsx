import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { StatCard, PageHeader } from '@/design'
import { Link } from '@/i18n/navigation'
import { Building2, Users, Sparkles } from 'lucide-react'

export default async function AdminPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const t = await getTranslations('admin')

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect(`/${locale}/login`)
    }

    // Check if user is system admin
    const { data: profile } = await supabase
        .from('profiles')
        .select('is_system_admin')
        .eq('id', user.id)
        .single()

    if (!profile?.is_system_admin) {
        redirect(`/${locale}/dashboard`)
    }

    // Get stats
    const { count: orgCount } = await supabase
        .from('organizations')
        .select('*', { count: 'exact', head: true })

    const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })

    const { count: skillCount } = await supabase
        .from('skills')
        .select('*', { count: 'exact', head: true })

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader title={t('dashboardTitle')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    <p className="text-gray-500">{t('overview')}</p>

                    <div className="grid gap-6 md:grid-cols-3">
                        <StatCard
                            icon={Building2}
                            iconColor="purple"
                            title={t('stats.organizations')}
                            value={orgCount || 0}
                        />
                        <StatCard
                            icon={Users}
                            iconColor="blue"
                            title={t('stats.users')}
                            value={userCount || 0}
                        />
                        <StatCard
                            icon={Sparkles}
                            iconColor="green"
                            title={t('stats.skills')}
                            value={skillCount || 0}
                        />
                    </div>

                    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('quickActions')}</h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Link
                                href="/admin/organizations"
                                className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-200"
                            >
                                <div className="p-3 rounded-lg bg-purple-50">
                                    <Building2 className="text-purple-500" size={24} />
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">{t('manageOrganizations')}</p>
                                    <p className="text-sm text-gray-500">{t('manageOrganizationsDesc')}</p>
                                </div>
                            </Link>

                            <Link
                                href="/admin/users"
                                className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-200"
                            >
                                <div className="p-3 rounded-lg bg-blue-50">
                                    <Users className="text-blue-500" size={24} />
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900">{t('manageUsers')}</p>
                                    <p className="text-sm text-gray-500">{t('manageUsersDesc')}</p>
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
