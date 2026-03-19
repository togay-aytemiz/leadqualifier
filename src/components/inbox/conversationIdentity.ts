import type { ConversationPlatform } from '@/types/database'

type ConversationIdentityInput = {
  platform: ConversationPlatform
  contact_phone?: string | null
}

function readTrimmedString(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function resolveConversationSecondaryIdentifier(
  conversation: ConversationIdentityInput,
  emptyStateLabel: string
) {
  if (conversation.platform === 'instagram') return null
  return readTrimmedString(conversation.contact_phone) ?? emptyStateLabel
}
