import { createClient } from '@/lib/supabase/server'
import { getConversations } from '@/lib/inbox/actions'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { getRequiredIntakeFields } from '@/lib/ai/followup'
import { InboxContainer } from '@/components/inbox/InboxContainer'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export default async function InboxPage() {
    const t = await getTranslations('inbox')
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const orgContext = await resolveActiveOrganizationContext(supabase)
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-50 text-gray-500">
                <div className="text-center">
                    <Building2 className="text-gray-300 mx-auto mb-4" size={48} />
                    <p className="text-lg font-medium text-gray-900">{t('noOrg')}</p>
                    <p className="text-sm text-gray-500">{t('noOrgDesc')}</p>
                </div>
            </div>
        )
    }

    const [conversations, aiSettings, requiredIntakeFields] = await Promise.all([
        getConversations(organizationId),
        getOrgAiSettings(organizationId, { supabase }),
        getRequiredIntakeFields({ organizationId, supabase })
    ])

    return (
        <InboxContainer
            initialConversations={conversations}
            organizationId={organizationId}
            botName={aiSettings.bot_name}
            botMode={aiSettings.bot_mode}
            allowLeadExtractionDuringOperator={aiSettings.allow_lead_extraction_during_operator}
            requiredIntakeFields={requiredIntakeFields}
            isReadOnly={orgContext?.readOnlyTenantMode ?? false}
        />
    )
}
