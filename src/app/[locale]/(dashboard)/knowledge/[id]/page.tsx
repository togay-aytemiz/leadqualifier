import { getKnowledgeBaseEntry, getCollections } from '@/lib/knowledge-base/actions'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { EditContentForm } from './EditContentForm'

interface EditPageProps {
    params: Promise<{ id: string }>
}

export default async function EditContentPage({ params }: EditPageProps) {
    const { id } = await params
    const supabase = await createClient()
    const orgContext = await resolveActiveOrganizationContext(supabase)
    const organizationId = orgContext?.activeOrganizationId ?? null

    // Fetch data on the server
    const [entry, collections] = await Promise.all([
        getKnowledgeBaseEntry(id, organizationId),
        getCollections(organizationId)
    ])

    return (
        <EditContentForm
            id={id}
            initialTitle={entry.title}
            initialContent={entry.content}
            initialCollectionId={entry.collection_id}
            initialStatus={entry.status ?? 'ready'}
            collections={collections}
        />
    )
}
