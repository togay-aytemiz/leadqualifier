import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import OrganizationSettingsClient from './OrganizationSettingsClient'
import { getOfferingProfile, getOfferingProfileSuggestions } from '@/lib/leads/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

export default async function OrganizationSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tOrg = await getTranslations('organizationSettings')

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{tOrg('noOrganization')}</h2>
                    <p>{tOrg('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: '/settings/organization',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const [{ data: organization }, offeringProfile, offeringProfileSuggestions] = await Promise.all([
        supabase
            .from('organizations')
            .select('name, billing_region')
            .eq('id', organizationId)
            .single(),
        getOfferingProfile(organizationId),
        getOfferingProfileSuggestions(organizationId, locale, { includeArchived: true })
    ])

    const initialBillingRegion = organization?.billing_region === 'INTL' ? 'INTL' : 'TR'

    return (
        <OrganizationSettingsClient
            initialName={organization?.name ?? ''}
            initialBillingRegion={initialBillingRegion}
            organizationId={organizationId}
            offeringProfile={offeringProfile}
            offeringProfileSuggestions={offeringProfileSuggestions}
        />
    )
}
