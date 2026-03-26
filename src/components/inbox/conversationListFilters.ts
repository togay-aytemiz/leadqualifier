import type {
  ConversationLeadTemperatureFilter,
  ConversationListItem,
  ConversationUnreadFilter,
} from '@/lib/inbox/actions'

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

export function applyInboxListFilters({
  conversations,
  unreadFilter,
  leadTemperatureFilter,
}: ApplyInboxListFiltersInput) {
  return conversations.filter((conversation) => {
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
