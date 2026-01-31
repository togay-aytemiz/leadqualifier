import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getSkills } from '@/lib/skills/actions'
import { SkillCard } from '@/components/skills/SkillCard'
import { Link } from '@/i18n/navigation'

export default async function SkillsPage() {
    const t = await getTranslations('skills')
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Get user's first organization (simplified for MVP)
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
            // Skills table may not exist yet - handle gracefully
            skills = []
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
                    <p className="mt-2 text-zinc-400">{t('subtitle')}</p>
                </div>
                <div className="flex gap-3">
                    <Link
                        href="/skills/test"
                        className="px-4 py-2.5 bg-zinc-700 text-zinc-300 font-medium rounded-lg hover:bg-zinc-600 transition-colors"
                    >
                        {t('testSkill')}
                    </Link>
                    <Link
                        href="/skills/new"
                        className="px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        {t('createSkill')}
                    </Link>
                </div>
            </div>

            {skills.length === 0 ? (
                <div className="rounded-xl bg-zinc-800/50 p-12 border border-zinc-700/50 text-center">
                    <p className="text-zinc-400">{t('noSkills')}</p>
                    <Link
                        href="/skills/new"
                        className="mt-4 inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        {t('createSkill')}
                    </Link>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2">
                    {skills.map((skill) => (
                        <SkillCard key={skill.id} skill={skill} />
                    ))}
                </div>
            )}
        </div>
    )
}
