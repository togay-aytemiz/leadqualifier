import { dispatchBillingUpdated } from '@/lib/billing/events'

interface BrowserEventTarget {
    dispatchEvent: (event: Event) => boolean
}

interface ProcessKnowledgeDocumentInBackgroundOptions {
    fetchImpl?: typeof fetch
    eventTarget?: BrowserEventTarget
}

export const KNOWLEDGE_UPDATED_EVENT = 'knowledge-updated'
export const PENDING_SUGGESTIONS_UPDATED_EVENT = 'pending-suggestions-updated'

function dispatchCompletionEvents(eventTarget: BrowserEventTarget) {
    eventTarget.dispatchEvent(new Event(KNOWLEDGE_UPDATED_EVENT))
    eventTarget.dispatchEvent(new Event(PENDING_SUGGESTIONS_UPDATED_EVENT))
    dispatchBillingUpdated(eventTarget)
}

export async function processKnowledgeDocumentInBackground(
    documentId: string,
    options?: ProcessKnowledgeDocumentInBackgroundOptions
) {
    const fetchImpl = options?.fetchImpl ?? fetch
    const eventTarget = options?.eventTarget ?? window

    const response = await fetchImpl('/api/knowledge/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: documentId }),
        keepalive: true
    })

    if (!response.ok) {
        throw new Error(`Failed to process knowledge document: ${response.status}`)
    }

    dispatchCompletionEvents(eventTarget)
}
