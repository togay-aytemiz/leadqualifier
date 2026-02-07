import { createClient } from '@/lib/supabase/server'
import { getLocale } from 'next-intl/server'
import {
    getKnowledgeBaseEntries,
    getCollections,
    KnowledgeCollection,
    KnowledgeBaseEntry
} from '@/lib/knowledge-base/actions'
import { KnowledgeContainer } from './components/KnowledgeContainer'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

export const dynamic = 'force-dynamic'

interface KnowledgePageProps {
    searchParams: Promise<{ collectionId?: string }>
}

export default async function KnowledgeBasePage({ searchParams }: KnowledgePageProps) {
    const locale = await getLocale()
    const supabase = await createClient()
    const { collectionId } = await searchParams
    const orgContext = await resolveActiveOrganizationContext(supabase)
    const organizationId = orgContext?.activeOrganizationId ?? null

    // Fetch data in parallel
    const [entries, allCollections] = await Promise.all([
        getKnowledgeBaseEntries(collectionId, organizationId),
        getCollections(organizationId)
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

    let aiSuggestionsEnabled = false
    let pendingSuggestions = 0

    if (organizationId) {
        const { data: profile } = await supabase
            .from('offering_profiles')
            .select('ai_suggestions_enabled')
            .eq('organization_id', organizationId)
            .maybeSingle()

        aiSuggestionsEnabled = profile?.ai_suggestions_enabled ?? false
        pendingSuggestions = await getPendingOfferingProfileSuggestionCount(organizationId, locale)
    }

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
