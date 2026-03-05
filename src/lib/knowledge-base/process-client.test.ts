import { describe, expect, it, vi } from 'vitest'

import { BILLING_UPDATED_EVENT } from '@/lib/billing/events'
import {
    KNOWLEDGE_UPDATED_EVENT,
    PENDING_SUGGESTIONS_UPDATED_EVENT,
    processKnowledgeDocumentInBackground
} from '@/lib/knowledge-base/process-client'

describe('processKnowledgeDocumentInBackground', () => {
    it('dispatches completion events after successful processing', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200
        }))
        const dispatchEvent = vi.fn()

        await processKnowledgeDocumentInBackground('doc-1', {
            fetchImpl: fetchImpl as typeof fetch,
            eventTarget: { dispatchEvent }
        })

        expect(fetchImpl).toHaveBeenCalledWith('/api/knowledge/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'doc-1' }),
            keepalive: true
        })
        expect(dispatchEvent).toHaveBeenCalledTimes(3)
        expect(dispatchEvent.mock.calls.map(([event]) => (event as Event).type)).toEqual([
            KNOWLEDGE_UPDATED_EVENT,
            PENDING_SUGGESTIONS_UPDATED_EVENT,
            BILLING_UPDATED_EVENT
        ])
    })

    it('throws and does not dispatch events when processing fails', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: false,
            status: 500
        }))
        const dispatchEvent = vi.fn()

        await expect(processKnowledgeDocumentInBackground('doc-1', {
            fetchImpl: fetchImpl as typeof fetch,
            eventTarget: { dispatchEvent }
        })).rejects.toThrow('Failed to process knowledge document')
        expect(dispatchEvent).not.toHaveBeenCalled()
    })
})
