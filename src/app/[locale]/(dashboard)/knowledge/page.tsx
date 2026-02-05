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

export const dynamic = 'force-dynamic'

interface KnowledgePageProps {
    searchParams: Promise<{ collectionId?: string }>
}

export default async function KnowledgeBasePage({ searchParams }: KnowledgePageProps) {
    const locale = await getLocale()
    const supabase = await createClient()
    const { collectionId } = await searchParams

    // Fetch data in parallel
    const [entries, allCollections] = await Promise.all([
        getKnowledgeBaseEntries(collectionId),
        getCollections()
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

    const { data: { user } } = await supabase.auth.getUser()
    let organizationId: string | null = null
    let aiSuggestionsEnabled = false
    let pendingSuggestions = 0

    if (user) {
        const { data: membership } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .limit(1)
            .single()

        organizationId = membership?.organization_id ?? null

        if (organizationId) {
            const { data: profile } = await supabase
                .from('offering_profiles')
                .select('ai_suggestions_enabled')
                .eq('organization_id', organizationId)
                .maybeSingle()

            aiSuggestionsEnabled = profile?.ai_suggestions_enabled ?? false
            pendingSuggestions = await getPendingOfferingProfileSuggestionCount(organizationId, locale)
        }
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
        />
    )
}
