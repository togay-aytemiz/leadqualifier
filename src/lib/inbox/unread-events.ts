export const INBOX_UNREAD_UPDATED_EVENT = 'inbox-unread-updated'
export const INBOX_UNREAD_STATE_EVENT = 'inbox-unread-state'

export interface InboxUnreadUpdatedDetail {
    organizationId?: string | null
}

export interface InboxUnreadStateDetail extends InboxUnreadUpdatedDetail {
    hasUnread?: boolean | null
}

type InboxUnreadEventTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener' | 'dispatchEvent'>

function normalizeOrganizationId(organizationId: string | null | undefined) {
    if (typeof organizationId !== 'string') return null
    const trimmed = organizationId.trim()
    return trimmed.length > 0 ? trimmed : null
}

function resolveEventTarget(target?: InboxUnreadEventTarget | null) {
    if (target) return target
    if (typeof window === 'undefined') return null
    return window
}

function normalizeHasUnread(hasUnread: boolean | null | undefined) {
    return typeof hasUnread === 'boolean' ? hasUnread : null
}

export function shouldRefreshInboxUnreadIndicator(
    currentOrganizationId: string | null,
    detail?: InboxUnreadUpdatedDetail | null
) {
    const normalizedCurrent = normalizeOrganizationId(currentOrganizationId)
    if (!normalizedCurrent) return false

    const normalizedEventOrganizationId = normalizeOrganizationId(detail?.organizationId)
    return !normalizedEventOrganizationId || normalizedEventOrganizationId === normalizedCurrent
}

export function dispatchInboxUnreadUpdated(
    detail?: InboxUnreadUpdatedDetail | null,
    target?: InboxUnreadEventTarget | null
) {
    const resolvedTarget = resolveEventTarget(target)
    if (!resolvedTarget) return

    resolvedTarget.dispatchEvent(new CustomEvent<InboxUnreadUpdatedDetail>(INBOX_UNREAD_UPDATED_EVENT, {
        detail: {
            organizationId: normalizeOrganizationId(detail?.organizationId)
        }
    }))
}

export function listenForInboxUnreadUpdates(
    listener: (detail: InboxUnreadUpdatedDetail) => void,
    target?: InboxUnreadEventTarget | null
) {
    const resolvedTarget = resolveEventTarget(target)
    if (!resolvedTarget) {
        return () => {}
    }

    const handler = (event: Event) => {
        const detail = event instanceof CustomEvent
            ? event.detail as InboxUnreadUpdatedDetail | null | undefined
            : null

        listener({
            organizationId: normalizeOrganizationId(detail?.organizationId)
        })
    }

    resolvedTarget.addEventListener(INBOX_UNREAD_UPDATED_EVENT, handler)
    return () => resolvedTarget.removeEventListener(INBOX_UNREAD_UPDATED_EVENT, handler)
}

export function dispatchInboxUnreadState(
    detail?: InboxUnreadStateDetail | null,
    target?: InboxUnreadEventTarget | null
) {
    const resolvedTarget = resolveEventTarget(target)
    if (!resolvedTarget) return

    resolvedTarget.dispatchEvent(new CustomEvent<InboxUnreadStateDetail>(INBOX_UNREAD_STATE_EVENT, {
        detail: {
            organizationId: normalizeOrganizationId(detail?.organizationId),
            hasUnread: normalizeHasUnread(detail?.hasUnread)
        }
    }))
}

export function listenForInboxUnreadState(
    listener: (detail: InboxUnreadStateDetail) => void,
    target?: InboxUnreadEventTarget | null
) {
    const resolvedTarget = resolveEventTarget(target)
    if (!resolvedTarget) {
        return () => {}
    }

    const handler = (event: Event) => {
        const detail = event instanceof CustomEvent
            ? event.detail as InboxUnreadStateDetail | null | undefined
            : null

        listener({
            organizationId: normalizeOrganizationId(detail?.organizationId),
            hasUnread: normalizeHasUnread(detail?.hasUnread)
        })
    }

    resolvedTarget.addEventListener(INBOX_UNREAD_STATE_EVENT, handler)
    return () => resolvedTarget.removeEventListener(INBOX_UNREAD_STATE_EVENT, handler)
}
