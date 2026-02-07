import { getLocale, getTranslations } from 'next-intl/server'
import { StatCard, PageHeader } from '@/design'
import { Link } from '@/i18n/navigation'
import { Activity, Building2, Database, Sparkles, Users } from 'lucide-react'
import { requireSystemAdmin } from '@/lib/admin/access'
import { getAdminDashboardSummary } from '@/lib/admin/read-models'

export default async function AdminPage() {
    const locale = await getLocale()
    const t = await getTranslations('admin')
    const { supabase } = await requireSystemAdmin(locale)
    const summary = await getAdminDashboardSummary(supabase)

    const formatter = new Intl.NumberFormat(locale)

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader title={t('dashboardTitle')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    <p className="text-gray-500">{t('overview')}</p>
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                        {t('readOnlyBanner')}
                    </p>

                    <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-6">
                        <StatCard
                            icon={Building2}
                            iconColor="purple"
                            title={t('stats.organizations')}
                            value={formatter.format(summary.organizationCount)}
                        />
                        <StatCard
                            icon={Users}
                            iconColor="blue"
                            title={t('stats.users')}
                            value={formatter.format(summary.userCount)}
                        />
                        <StatCard
                            icon={Sparkles}
                            iconColor="green"
                            title={t('stats.skills')}
                            value={formatter.format(summary.skillCount)}
                        />
                        <StatCard
                            icon={Database}
                            iconColor="orange"
                            title={t('stats.knowledge')}
                            value={formatter.format(summary.knowledgeDocumentCount)}
                        />
                        <StatCard
                            icon={Activity}
                            iconColor="red"
                            title={t('stats.messages')}
                            value={formatter.format(summary.messageCount)}
                        />
                        <StatCard
                            icon={Sparkles}
                            iconColor="purple"
                            title={t('stats.tokens')}
                            value={formatter.format(summary.totalTokenCount)}
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
