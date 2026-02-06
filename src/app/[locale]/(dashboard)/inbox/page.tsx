import { createClient } from '@/lib/supabase/server'
import { getConversations } from '@/lib/inbox/actions'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { getRequiredIntakeFields } from '@/lib/ai/followup'
import { InboxContainer } from '@/components/inbox/InboxContainer'
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

    // Get user's first organization
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    const isSystemAdmin = profile?.is_system_admin ?? false
    let organizationId: string | null = null

    if (isSystemAdmin) {
        const { data: org } = await supabase.from('organizations').select('id').limit(1).single()
        organizationId = org?.id || null
    } else {
        const { data: membership } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .limit(1)
            .single()
        organizationId = membership?.organization_id || null
    }

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
        />
    )
}
