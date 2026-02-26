import type { ConversationListItem } from '@/lib/inbox/actions'

export type InboxQueueTab = 'me' | 'unassigned' | 'all'

interface QueueFilterInput {
    conversations: ConversationListItem[]
    queue: InboxQueueTab
    currentUserId: string | null
}

interface QueueCountInput {
    conversations: ConversationListItem[]
    currentUserId: string | null
}

export interface InboxQueueCounts {
    me: number
    unassigned: number
    all: number
    meAttention: number
    unassignedAttention: number
}

function isUnassignedOperatorConversation(conversation: ConversationListItem) {
    return conversation.active_agent === 'operator' && !conversation.assignee_id
}

export function filterConversationsByQueue({ conversations, queue, currentUserId }: QueueFilterInput) {
    if (queue === 'all') return conversations

    if (queue === 'me') {
        if (!currentUserId) return []
        return conversations.filter((conversation) => conversation.assignee_id === currentUserId)
    }

    return conversations.filter(isUnassignedOperatorConversation)
}

export function summarizeConversationQueueCounts({ conversations, currentUserId }: QueueCountInput): InboxQueueCounts {
    const meConversations = currentUserId
        ? conversations.filter((conversation) => conversation.assignee_id === currentUserId)
        : []
    const unassignedConversations = conversations.filter(isUnassignedOperatorConversation)

    return {
        me: meConversations.length,
        unassigned: unassignedConversations.length,
        all: conversations.length,
        meAttention: meConversations.filter((conversation) => Boolean(conversation.human_attention_required)).length,
        unassignedAttention: unassignedConversations.filter((conversation) => Boolean(conversation.human_attention_required)).length
    }
}
