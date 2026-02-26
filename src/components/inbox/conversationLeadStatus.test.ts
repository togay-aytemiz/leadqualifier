import { describe, expect, it } from 'vitest'
import { applyLeadStatusToConversationList } from '@/components/inbox/conversationLeadStatus'
import type { ConversationListItem } from '@/lib/inbox/actions'

function buildConversation(id: string, status?: string): ConversationListItem {
    return {
        id,
        organization_id: 'org-1',
        platform: 'whatsapp',
        contact_name: `Contact ${id}`,
        contact_phone: `+90${id}`,
        status: 'open',
        active_agent: 'bot',
        ai_processing_paused: false,
        unread_count: 0,
        assignee_id: null,
        assignee_assigned_at: null,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        leads: status ? [{ status }] : []
    }
}

describe('applyLeadStatusToConversationList', () => {
    it('updates matching conversation with cold status', () => {
        const conversations = [buildConversation('1', 'warm'), buildConversation('2', 'hot')]
        const next = applyLeadStatusToConversationList(conversations, '1', 'cold')

        expect(next[0]?.leads?.[0]?.status).toBe('cold')
        expect(next[1]?.leads?.[0]?.status).toBe('hot')
    })

    it('clears lead status when lead row is removed', () => {
        const conversations = [buildConversation('1', 'cold')]
        const next = applyLeadStatusToConversationList(conversations, '1', null)

        expect(next[0]?.leads).toEqual([])
    })
})
