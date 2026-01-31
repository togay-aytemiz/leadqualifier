import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getSkills } from '@/lib/skills/actions'
import { Link } from '@/i18n/navigation'
import {
    Sidebar,
    SidebarGroup,
    SidebarItem,
    PageHeader,
    Button,
    Badge,
    DataTable,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    TableToolbar,
    SearchInput,
    EmptyState,
    StatusDot
} from '@/design'

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
                    <DataTable>
                        <TableToolbar
                            left={<span>{skills.length} skills</span>}
                            right={<SearchInput placeholder="Search skills..." />}
                        />

                        {skills.length === 0 ? (
                            <EmptyState
                                icon="auto_awesome"
                                title={t('noSkills')}
                                description="Create your first skill to get started"
                                action={
                                    <Link href="/skills/new">
                                        <Button variant="primary">
                                            <span className="material-symbols-outlined text-[18px] mr-2">add</span>
                                            {t('createSkill')}
                                        </Button>
                                    </Link>
                                }
                            />
                        ) : (
                            <>
                                <TableHead columns={['Skill Name', 'Response Preview', 'Triggers', 'Status', '']} />
                                <TableBody>
                                    {skills.map((skill) => (
                                        <TableRow key={skill.id}>
                                            <TableCell>
                                                <Link href={`/skills/${skill.id}`} className="font-semibold text-gray-900 hover:text-blue-600">
                                                    {skill.title}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-gray-500 truncate max-w-[300px]">
                                                {skill.response_text.substring(0, 80)}...
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="neutral">
                                                    {skill.trigger_examples.length} triggers
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <StatusDot active={skill.enabled} label={skill.enabled ? 'Active' : 'Inactive'} />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Link href={`/skills/${skill.id}`}>
                                                    <button className="text-gray-400 hover:text-gray-600">
                                                        <span className="material-symbols-outlined">more_horiz</span>
                                                    </button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </>
                        )}
                    </DataTable>
                </div>
            </div>
        </>
    )
}
