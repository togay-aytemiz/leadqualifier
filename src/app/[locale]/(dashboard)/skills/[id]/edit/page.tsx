import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { getSkill } from '@/lib/skills/actions'
import { SkillForm } from '@/components/skills/SkillForm'
import { Link } from '@/i18n/navigation'

interface EditSkillPageProps {
    params: Promise<{ id: string }>
}

export default async function EditSkillPage({ params }: EditSkillPageProps) {
    const { id } = await params
    const t = await getTranslations('skills')
    const tc = await getTranslations('common')

    const skill = await getSkill(id)

    if (!skill) {
        notFound()
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex items-center gap-4">
                <Link href="/skills" className="text-zinc-400 hover:text-zinc-300">
                    ← {tc('back')}
                </Link>
            </div>

            <div>
                <h1 className="text-3xl font-bold text-white">{t('editSkill')}</h1>
            </div>

            <SkillForm organizationId={skill.organization_id} skill={skill} />
        </div>
    )
}
