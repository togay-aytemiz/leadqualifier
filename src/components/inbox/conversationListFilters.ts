import type {
  ConversationLeadTemperatureFilter,
  ConversationListItem,
  ConversationUnreadFilter,
} from '@/lib/inbox/actions'
import { isDeletedOnlyInstagramConversationPreview } from '@/lib/inbox/instagram-deleted-thread'

export type InboxUnreadFilter = ConversationUnreadFilter
export type InboxLeadTemperatureFilter = ConversationLeadTemperatureFilter

interface ApplyInboxListFiltersInput {
  conversations: ConversationListItem[]
  unreadFilter: InboxUnreadFilter
  leadTemperatureFilter: InboxLeadTemperatureFilter
}

function normalizeLeadStatus(status: string | null | undefined) {
  if (typeof status !== 'string') return null
  const normalized = status.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function shouldSuppressDeletedOnlyInstagramConversation(conversation: ConversationListItem) {
  return isDeletedOnlyInstagramConversationPreview(conversation)
}

export function applyInboxListFilters({
  conversations,
  unreadFilter,
  leadTemperatureFilter,
}: ApplyInboxListFiltersInput) {
  return conversations.filter((conversation) => {
    if (shouldSuppressDeletedOnlyInstagramConversation(conversation)) {
      return false
    }

    if (unreadFilter === 'unread' && conversation.unread_count <= 0) {
      return false
    }

    if (leadTemperatureFilter !== 'all') {
      const leadStatus = normalizeLeadStatus(conversation.leads?.[0]?.status)
      if (leadStatus !== leadTemperatureFilter) {
        return false
      }
    }

    return true
  })
}

export function hasActiveInboxListFilters(args: {
  unreadFilter: InboxUnreadFilter
  leadTemperatureFilter: InboxLeadTemperatureFilter
}) {
  return args.unreadFilter !== 'all' || args.leadTemperatureFilter !== 'all'
}
