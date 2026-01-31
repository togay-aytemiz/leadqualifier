import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getSkills } from '@/lib/skills/actions'
import { Link } from '@/i18n/navigation'
import { Sidebar, SidebarGroup, SidebarItem, PageHeader, Button, Badge } from '@/design'

export default async function SkillsPage() {
    const t = await getTranslations('skills')
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()

    const organizationId = membership?.organization_id

    let skills: Awaited<ReturnType<typeof getSkills>> = []
    if (organizationId) {
        try {
            skills = await getSkills(organizationId)
        } catch {
            skills = []
        }
    }

    return (
        <>
            {/* Inner Sidebar */}
            <Sidebar title="Fin AI Agent">
                <SidebarGroup title="Overview">
                    <SidebarItem icon="analytics" label="Performance" href="/dashboard" />
                    <SidebarItem icon="auto_awesome" label="Skills" active />
                    <SidebarItem icon="book" label="Knowledge" />
                </SidebarGroup>

                <SidebarGroup title="Configuration">
                    <SidebarItem icon="settings" label="General settings" />
                    <SidebarItem icon="toggle_on" label="Handovers" />
                    <SidebarItem icon="shield" label="Security" />
                </SidebarGroup>
            </Sidebar>

            {/* Main Content */}
            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <PageHeader
                    title="Skills"
                    actions={
                        <Link href="/skills/new">
                            <Button variant="primary" size="md">
                                <span className="material-symbols-outlined text-[18px] mr-2">add</span>
                                New skill
                            </Button>
                        </Link>
                    }
                />

                <div className="flex-1 overflow-auto p-8">
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 text-sm text-gray-500 flex items-center justify-between">
                            <span>{skills.length} skills</span>
                            <div className="relative w-64">
                                <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-[18px]">search</span>
                                <input className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm placeholder-gray-400" placeholder="Search skills..." />
                            </div>
                        </div>

                        {skills.length === 0 ? (
                            <div className="p-12 text-center">
                                <span className="material-symbols-outlined text-gray-300 text-5xl mb-4">auto_awesome</span>
                                <p className="text-gray-500 mb-4">{t('noSkills')}</p>
                                <Link href="/skills/new">
                                    <Button variant="primary">
                                        <span className="material-symbols-outlined text-[18px] mr-2">add</span>
                                        {t('createSkill')}
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <table className="w-full text-left text-sm text-gray-600">
                                <thead className="bg-white text-xs uppercase text-gray-500 font-semibold border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 w-[25%]">Skill Name</th>
                                        <th className="px-6 py-3 w-[35%]">Response Preview</th>
                                        <th className="px-6 py-3 w-[15%]">Triggers</th>
                                        <th className="px-6 py-3 w-[15%]">Status</th>
                                        <th className="px-6 py-3 w-[10%]"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {skills.map((skill) => (
                                        <tr key={skill.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <Link href={`/skills/${skill.id}`} className="font-semibold text-gray-900 hover:text-blue-600">
                                                    {skill.title}
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 truncate max-w-[300px]">
                                                {skill.response_text.substring(0, 80)}...
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge variant="neutral">
                                                    {skill.trigger_examples.length} triggers
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className={`h-2.5 w-2.5 rounded-full ${skill.enabled ? "bg-green-500" : "bg-gray-300"}`} />
                                                    <span className="text-gray-700">{skill.enabled ? 'Active' : 'Inactive'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Link href={`/skills/${skill.id}`}>
                                                    <button className="text-gray-400 hover:text-gray-600">
                                                        <span className="material-symbols-outlined">more_horiz</span>
                                                    </button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
