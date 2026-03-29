import type { ConversationListItem } from '@/lib/inbox/actions'
import { isDeletedOnlyInstagramConversationPreview } from '@/lib/inbox/instagram-deleted-thread'

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
    const visibleConversations = conversations.filter(
        (conversation) => !isDeletedOnlyInstagramConversationPreview(conversation)
    )

    if (queue === 'all') return visibleConversations

    if (queue === 'me') {
        if (!currentUserId) return []
        return visibleConversations.filter((conversation) => conversation.assignee_id === currentUserId)
    }

    return visibleConversations.filter(isUnassignedOperatorConversation)
}

export function summarizeConversationQueueCounts({ conversations, currentUserId }: QueueCountInput): InboxQueueCounts {
    const visibleConversations = conversations.filter(
        (conversation) => !isDeletedOnlyInstagramConversationPreview(conversation)
    )
    const meConversations = currentUserId
        ? visibleConversations.filter((conversation) => conversation.assignee_id === currentUserId)
        : []
    const unassignedConversations = visibleConversations.filter(isUnassignedOperatorConversation)

    return {
        me: meConversations.length,
        unassigned: unassignedConversations.length,
        all: visibleConversations.length,
        meAttention: meConversations.filter((conversation) => Boolean(conversation.human_attention_required)).length,
        unassignedAttention: unassignedConversations.filter((conversation) => Boolean(conversation.human_attention_required)).length
    }
}
