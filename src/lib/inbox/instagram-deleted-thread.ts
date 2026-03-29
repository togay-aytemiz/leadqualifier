type PreviewMessageCandidate = {
  content?: string | null
  metadata?: unknown
  sender_type?: string | null
}

type ConversationCandidate = {
  platform?: string | null
  messages?: PreviewMessageCandidate[] | null | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseMetadataRecord(metadata: unknown) {
  if (isRecord(metadata)) return metadata
  if (typeof metadata !== 'string') return null
  const trimmed = metadata.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function isInstagramDeletedPreviewMessage(message: PreviewMessageCandidate | null | undefined) {
  if (!message) return false
  if (message.sender_type && message.sender_type !== 'contact') return false

  const parsedMetadata = parseMetadataRecord(message.metadata)
  const eventType = readTrimmedString(parsedMetadata?.instagram_event_type)?.toLowerCase() ?? null
  if (eventType === 'message_deleted') return true
  if (eventType && eventType !== 'message_deleted') return false

  const normalizedContent = readTrimmedString(message.content)?.toLowerCase() ?? null
  return (
    normalizedContent === '[instagram message deleted]' ||
    normalizedContent === 'instagram message deleted'
  )
}

export function isDeletedOnlyInstagramConversationPreview(
  conversation: ConversationCandidate | null | undefined
) {
  if (!conversation || conversation.platform !== 'instagram') return false
  if (!Array.isArray(conversation.messages) || conversation.messages.length !== 1) return false

  return isInstagramDeletedPreviewMessage(conversation.messages[0])
}
