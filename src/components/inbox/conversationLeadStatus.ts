import type { ConversationListItem } from '@/lib/inbox/actions'

export function applyLeadStatusToConversationList(
    conversations: ConversationListItem[],
    conversationId: string,
    status: string | null | undefined
): ConversationListItem[] {
    return conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation
        return {
            ...conversation,
            leads: status ? [{ status }] : []
        }
    })
}
