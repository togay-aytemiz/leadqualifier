import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/server'
import { getConversationListItem, getConversations } from '@/lib/inbox/actions'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { getRequiredIntakeFields } from '@/lib/ai/followup'
import { getServiceCatalogItems } from '@/lib/leads/settings'
import { DashboardRouteSkeleton } from '@/components/common/DashboardRouteSkeleton'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

const InboxContainer = dynamic(
    () => import('@/components/inbox/InboxContainer').then((mod) => mod.InboxContainer),
    {
        loading: () => <DashboardRouteSkeleton route="inbox" />
    }
)

interface InboxPageProps {
    searchParams: Promise<{ conversation?: string }>
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
    const locale = await getLocale()
    const t = await getTranslations('inbox')
    const supabase = await createClient()
    const renderedAtIso = new Date().toISOString()
    const params = await searchParams
    const requestedConversationId = typeof params.conversation === 'string'
        && params.conversation.trim().length > 0
        ? params.conversation.trim()
        : null

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) {
        redirect('/login')
    }
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

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: '/inbox',
        supabase,
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const [conversations, requestedConversation, aiSettings, requiredIntakeFields, serviceCatalogItems] = await Promise.all([
        getConversations(organizationId),
        requestedConversationId
            ? getConversationListItem(organizationId, requestedConversationId)
            : Promise.resolve(null),
        getOrgAiSettings(organizationId, { supabase }),
        getRequiredIntakeFields({ organizationId, supabase }),
        getServiceCatalogItems(organizationId)
    ])
    const initialConversations = requestedConversation
        && !conversations.some((conversation) => conversation.id === requestedConversation.id)
        ? [requestedConversation, ...conversations]
        : conversations

    return (
        <InboxContainer
            initialConversations={initialConversations}
            initialSelectedConversationId={requestedConversationId}
            renderedAtIso={renderedAtIso}
            organizationId={organizationId}
            botName={aiSettings.bot_name}
            botMode={aiSettings.bot_mode}
            allowLeadExtractionDuringOperator={aiSettings.allow_lead_extraction_during_operator}
            requiredIntakeFields={requiredIntakeFields}
            serviceCatalogNames={serviceCatalogItems.map((item) => item.name)}
            isReadOnly={orgContext?.readOnlyTenantMode ?? false}
        />
    )
}
