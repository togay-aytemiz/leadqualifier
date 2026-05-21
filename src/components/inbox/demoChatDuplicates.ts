import type { Message } from '@/types/database'

function parseMetadataRecord(metadata: unknown) {
  if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>
  }

  if (typeof metadata !== 'string') return null
  const trimmed = metadata.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }

  return null
}

function readTrimmedString(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveDemoChatReplyKind(metadata: Record<string, unknown>) {
  const explicitKind = readTrimmedString(metadata.demo_chat_reply_kind)?.toLowerCase()
  if (explicitKind) return explicitKind

  const messageType = readTrimmedString(metadata.demo_chat_message_type)?.toLowerCase()
  const mediaType = readTrimmedString(metadata.demo_chat_media_type)?.toLowerCase()
  if (messageType === 'image' || mediaType === 'image') return 'image'

  return 'text'
}

function buildDemoChatReplyDedupeKey(message: Message) {
  if (message.sender_type !== 'bot') return null

  const metadata = parseMetadataRecord(message.metadata)
  const replyToMessageId = readTrimmedString(metadata?.demo_chat_reply_to_message_id)
  if (!metadata || !replyToMessageId) return null

  return `${replyToMessageId}:${resolveDemoChatReplyKind(metadata)}`
}

export function filterDemoChatBotReplyDuplicates(messages: Message[]) {
  const seenReplyKeys = new Set<string>()

  return messages.filter((message) => {
    const replyKey = buildDemoChatReplyDedupeKey(message)
    if (!replyKey) return true
    if (seenReplyKeys.has(replyKey)) return false

    seenReplyKeys.add(replyKey)
    return true
  })
}
