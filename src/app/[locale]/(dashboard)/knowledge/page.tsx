import { getSkills } from '@/lib/skills/actions'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import {
    getKnowledgeBaseEntries,
    getCollections,
    KnowledgeCollection,
    KnowledgeBaseEntry
} from '@/lib/knowledge-base/actions'
import { KnowledgeContainer } from './components/KnowledgeContainer'

export const dynamic = 'force-dynamic'

interface KnowledgePageProps {
    searchParams: Promise<{ collectionId?: string }>
}

export default async function KnowledgeBasePage({ searchParams }: KnowledgePageProps) {
    const t = await getTranslations('knowledge')
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

    return (
        <KnowledgeContainer
            initialEntries={entries}
            initialCollections={displayCollections}
            currentCollection={currentCollection}
            collectionId={collectionId}
        />
    )
}
