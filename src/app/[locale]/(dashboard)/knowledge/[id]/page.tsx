import { getKnowledgeBaseEntry, getCollections } from '@/lib/knowledge-base/actions'
import { EditContentForm } from './EditContentForm'

interface EditPageProps {
    params: Promise<{ id: string }>
}

export default async function EditContentPage({ params }: EditPageProps) {
    const { id } = await params

    // Fetch data on the server
    const [entry, collections] = await Promise.all([
        getKnowledgeBaseEntry(id),
        getCollections()
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
