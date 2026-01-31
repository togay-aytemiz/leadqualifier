import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { SkillForm } from '@/components/skills/SkillForm'
import { Link } from '@/i18n/navigation'

export default async function NewSkillPage() {
    const t = await getTranslations('skills')
    const tc = await getTranslations('common')
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Get user's first organization
    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()

    const organizationId = membership?.organization_id

    if (!organizationId) {
        return (
            <div className="rounded-xl bg-zinc-800/50 p-12 border border-zinc-700/50 text-center">
                <p className="text-zinc-400">No organization found. Please sign up with a valid account.</p>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex items-center gap-4">
                <Link
                    href="/skills"
                    className="text-zinc-400 hover:text-zinc-300"
                >
                    ← {tc('back')}
                </Link>
            </div>

            <div>
                <h1 className="text-3xl font-bold text-white">{t('createSkill')}</h1>
            </div>

            <SkillForm organizationId={organizationId} />
        </div>
    )
}
