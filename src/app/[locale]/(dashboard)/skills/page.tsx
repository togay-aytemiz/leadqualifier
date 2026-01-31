import { getSkills } from '@/lib/skills/actions'
import { createClient } from '@/lib/supabase/server'
import { SkillsContainer } from '@/components/skills/SkillsContainer'

interface SkillsPageProps {
    searchParams: { q?: string }
}

export default async function SkillsPage({ searchParams }: SkillsPageProps) {
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
    const query = searchParams?.q || ''

    let skills: Awaited<ReturnType<typeof getSkills>> = []
    if (organizationId) {
        try {
            skills = await getSkills(organizationId, query)
        } catch {
            skills = []
        }
    }

    if (!organizationId) return null

    return (
        <div className="flex-1 h-full overflow-hidden flex flex-col">
            <SkillsContainer
                initialSkills={skills}
                organizationId={organizationId}
            />
        </div>
    )
}
