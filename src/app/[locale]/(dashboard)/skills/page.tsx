import { getSkills } from '@/lib/skills/actions'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { DEFAULT_HANDOVER_MESSAGE_EN, DEFAULT_HANDOVER_MESSAGE_TR } from '@/lib/ai/escalation'
import { createClient } from '@/lib/supabase/server'
import { SkillsContainer } from '@/components/skills/SkillsContainer'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getLocale, getTranslations } from 'next-intl/server'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

interface SkillsPageProps {
    searchParams: Promise<{ q?: string }>
}

export default async function SkillsPage({ searchParams }: SkillsPageProps) {
    const supabase = await createClient()
    const locale = await getLocale()
    const t = await getTranslations('skills')
    const { q } = await searchParams
    const query = q || ''

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (organizationId) {
        await enforceWorkspaceAccessOrRedirect({
            organizationId,
            locale,
            currentPath: '/skills',
            bypassLock: orgContext?.isSystemAdmin ?? false
        })
    }

    let skills: Awaited<ReturnType<typeof getSkills>> = []
    let handoverMessage = locale === 'tr' ? DEFAULT_HANDOVER_MESSAGE_TR : DEFAULT_HANDOVER_MESSAGE_EN
    if (organizationId) {
        try {
            const [skillsResult, aiSettings] = await Promise.all([
                getSkills(organizationId, query, locale),
                getOrgAiSettings(organizationId, { supabase })
            ])
            skills = skillsResult
            handoverMessage = locale === 'tr'
                ? aiSettings.hot_lead_handover_message_tr
                : aiSettings.hot_lead_handover_message_en
        } catch {
            skills = []
            handoverMessage = locale === 'tr' ? DEFAULT_HANDOVER_MESSAGE_TR : DEFAULT_HANDOVER_MESSAGE_EN
        }
    }

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{t('noOrganization')}</h2>
                    <p>{t('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 h-full overflow-hidden flex flex-col">
            <SkillsContainer
                initialSkills={skills}
                organizationId={organizationId}
                handoverMessage={handoverMessage}
                isReadOnly={orgContext?.readOnlyTenantMode ?? false}
            />
        </div>
    )
}
