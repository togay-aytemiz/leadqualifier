import type { ConversationListItem } from '@/lib/inbox/actions'
import type { Conversation, Message } from '@/types/database'

type PreviewMessage = Pick<Message, 'content' | 'created_at' | 'sender_type' | 'metadata'>

export const CONVERSATION_LIST_PREVIEW_MESSAGE_LIMIT = 5

function toTimestampMs(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  const timestamp = parsed.getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function resolveLatestPreviewTimestamp(messages: ConversationListItem['messages']) {
  if (!Array.isArray(messages) || messages.length === 0) return null

  let latestTimestamp: number | null = null
  for (const message of messages) {
    const timestamp = toTimestampMs(message.created_at)
    if (timestamp === null) continue
    if (latestTimestamp === null || timestamp > latestTimestamp) {
      latestTimestamp = timestamp
    }
  }

  return latestTimestamp
}

export function buildConversationPreviewMessages(
  messages: PreviewMessage[] | null | undefined,
  limit: number = CONVERSATION_LIST_PREVIEW_MESSAGE_LIMIT
): NonNullable<ConversationListItem['messages']> {
  if (!Array.isArray(messages) || messages.length === 0) return []

  return [...messages]
    .sort((left, right) => {
      const leftTimestamp = toTimestampMs(left.created_at) ?? 0
      const rightTimestamp = toTimestampMs(right.created_at) ?? 0
      return rightTimestamp - leftTimestamp
    })
    .slice(0, limit)
    .map((message) => ({
      content: message.content,
      created_at: message.created_at,
      sender_type: message.sender_type,
      metadata: message.metadata,
    }))
}

export function mergeRealtimeConversationUpdate(args: {
  currentConversation: ConversationListItem
  incomingConversation: Conversation
  nextAssignee: ConversationListItem['assignee']
}) {
  const { currentConversation, incomingConversation, nextAssignee } = args
  const incomingLastMessageAt = toTimestampMs(incomingConversation.last_message_at)
  const currentPreviewTimestamp = resolveLatestPreviewTimestamp(currentConversation.messages)

  return {
    conversation: {
      ...currentConversation,
      ...incomingConversation,
      leads: currentConversation.leads,
      messages: currentConversation.messages,
      assignee: nextAssignee,
    } satisfies ConversationListItem,
    shouldHydratePreview:
      incomingLastMessageAt !== null &&
      (currentPreviewTimestamp === null || incomingLastMessageAt > currentPreviewTimestamp),
  }
}
