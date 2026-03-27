import { createClient } from '@/lib/supabase/server'
import {
    getOfferingProfile,
    getOfferingProfileSuggestions,
    getServiceCandidates,
    getServiceCatalogItems
} from '@/lib/leads/settings'
import OrganizationSettingsClient from './OrganizationSettingsClient'

interface OrganizationSettingsPageContentProps {
    organizationId: string
    locale: 'en' | 'tr'
    isReadOnly: boolean
}

export default async function OrganizationSettingsPageContent({
    organizationId,
    locale,
    isReadOnly
}: OrganizationSettingsPageContentProps) {
    const supabase = await createClient()
    const [
        { data: organization },
        offeringProfile,
        offeringProfileSuggestions,
        serviceCatalogItems,
        serviceCandidates
    ] = await Promise.all([
        supabase
            .from('organizations')
            .select('name')
            .eq('id', organizationId)
            .single(),
        getOfferingProfile(organizationId),
        getOfferingProfileSuggestions(organizationId, locale, { includeArchived: true }),
        getServiceCatalogItems(organizationId),
        getServiceCandidates(organizationId)
    ])

    return (
        <OrganizationSettingsClient
            initialName={organization?.name ?? ''}
            organizationId={organizationId}
            offeringProfile={offeringProfile}
            offeringProfileSuggestions={offeringProfileSuggestions}
            serviceCatalogItems={serviceCatalogItems}
            serviceCandidates={serviceCandidates}
            isReadOnly={isReadOnly}
        />
    )
}
