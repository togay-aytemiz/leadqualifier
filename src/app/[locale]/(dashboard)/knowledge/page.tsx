import { createClient } from '@/lib/supabase/server'
import {
    getKnowledgeBaseEntries,
    getCollections,
    KnowledgeCollection
} from '@/lib/knowledge-base/actions'
import { KnowledgeContainer } from './components/KnowledgeContainer'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

interface KnowledgePageProps {
    searchParams: Promise<{ collectionId?: string }>
}

export default async function KnowledgeBasePage({ searchParams }: KnowledgePageProps) {
    const supabase = await createClient()
    const { collectionId } = await searchParams
    const orgContext = await resolveActiveOrganizationContext()
    const organizationId = orgContext?.activeOrganizationId ?? null

    const [entries, allCollections, offeringProfileResult, pendingSuggestions] = await Promise.all([
        getKnowledgeBaseEntries(collectionId, organizationId),
        getCollections(organizationId),
        organizationId
            ? supabase
                .from('offering_profiles')
                .select('ai_suggestions_enabled')
                .eq('organization_id', organizationId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        organizationId
            ? getPendingOfferingProfileSuggestionCount(organizationId)
            : Promise.resolve(0)
    ])

    // Filter logic currently in action but good to double check or prepare collections
    // If we are in a collection, we only show files.
    // If we are at root (no collectionId), we show collections + root files.

    let currentCollection: KnowledgeCollection | null = null
    let displayCollections: KnowledgeCollection[] = []

    if (collectionId) {
        currentCollection = allCollections.find(c => c.id === collectionId) || null
        displayCollections = [] // Don't show nested folders (flat structure for now)
    } else {
        displayCollections = allCollections
    }

    const aiSuggestionsEnabled = offeringProfileResult?.data?.ai_suggestions_enabled ?? false

    return (
        <KnowledgeContainer
            initialEntries={entries}
            initialCollections={displayCollections}
            currentCollection={currentCollection}
            collectionId={collectionId}
            organizationId={organizationId}
            aiSuggestionsEnabled={aiSuggestionsEnabled}
            initialPendingSuggestions={pendingSuggestions}
            isReadOnly={orgContext?.readOnlyTenantMode ?? false}
        />
    )
}
