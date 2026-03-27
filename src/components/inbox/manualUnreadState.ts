type ConversationUnreadSnapshot = {
  unread_count: number
  manual_unread?: boolean
}

type ManualUnreadSelectionArgs = {
  previousSelectedId: string | null
  nextSelectedId: string
  nextConversation: Pick<ConversationUnreadSnapshot, 'manual_unread'> | null
}

type IncomingUnreadArgs = {
  isSelectedConversation: boolean
  shouldIncrementUnread: boolean
  unreadCount: number
  manualUnread: boolean
}

export function shouldAutoMarkConversationRead(
  conversation: ConversationUnreadSnapshot | null | undefined
) {
  return Boolean(conversation && conversation.unread_count > 0 && !conversation.manual_unread)
}

export function shouldClearManualUnreadOnSelect(args: ManualUnreadSelectionArgs) {
  return Boolean(
    args.previousSelectedId &&
      args.previousSelectedId !== args.nextSelectedId &&
      args.nextConversation?.manual_unread
  )
}

export function resolveSelectedConversationUnreadCountOnIncoming(args: IncomingUnreadArgs) {
  if (!args.isSelectedConversation) {
    return args.shouldIncrementUnread ? args.unreadCount + 1 : args.unreadCount
  }

  return args.manualUnread ? Math.max(args.unreadCount, 1) : 0
}
