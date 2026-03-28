type InboxRealtimeRecoveryReason = 'visibilitychange' | 'focus' | 'pageshow' | 'online'

type EventTargetLike = {
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

type VisibilityTargetLike = EventTargetLike & {
  visibilityState?: DocumentVisibilityState | string
}

interface AttachInboxRealtimeRecoveryListenersOptions {
  onRecover: (reason: InboxRealtimeRecoveryReason) => void
  throttleMs?: number
  documentTarget?: VisibilityTargetLike | null
  windowTarget?: EventTargetLike | null
  now?: () => number
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

export function shouldRecoverInboxRealtime(status: string) {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'
}

export function attachInboxRealtimeRecoveryListeners(
  options: AttachInboxRealtimeRecoveryListenersOptions
) {
  const documentTarget =
    options.documentTarget ??
    (typeof document !== 'undefined' ? (document as VisibilityTargetLike) : null)
  const windowTarget =
    options.windowTarget ?? (typeof window !== 'undefined' ? (window as EventTargetLike) : null)

  if (!documentTarget || !windowTarget) {
    return () => {}
  }

  const now = options.now ?? (() => Date.now())
  const throttleMs = Math.max(0, options.throttleMs ?? 1500)
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout

  let lastRecoveredAt = Number.NEGATIVE_INFINITY
  let trailingReason: InboxRealtimeRecoveryReason | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const flush = (reason: InboxRealtimeRecoveryReason) => {
    lastRecoveredAt = now()
    options.onRecover(reason)
  }

  const scheduleRecover = (reason: InboxRealtimeRecoveryReason) => {
    if (throttleMs === 0) {
      flush(reason)
      return
    }

    const elapsed = now() - lastRecoveredAt
    if (elapsed >= throttleMs) {
      flush(reason)
      return
    }

    if (!trailingReason) {
      trailingReason = reason
    }

    if (timeoutId) {
      return
    }

    timeoutId = setTimeoutFn(() => {
      timeoutId = null
      const nextReason = trailingReason ?? reason
      trailingReason = null
      flush(nextReason)
    }, throttleMs - elapsed)
  }

  const handleVisibilityChange = () => {
    if (documentTarget.visibilityState !== 'visible') return
    scheduleRecover('visibilitychange')
  }

  const handleFocus = () => {
    scheduleRecover('focus')
  }

  const handlePageShow = () => {
    scheduleRecover('pageshow')
  }

  const handleOnline = () => {
    scheduleRecover('online')
  }

  documentTarget.addEventListener('visibilitychange', handleVisibilityChange)
  windowTarget.addEventListener('focus', handleFocus)
  windowTarget.addEventListener('pageshow', handlePageShow)
  windowTarget.addEventListener('online', handleOnline)

  return () => {
    if (timeoutId) {
      clearTimeoutFn(timeoutId)
      timeoutId = null
    }
    trailingReason = null
    documentTarget.removeEventListener('visibilitychange', handleVisibilityChange)
    windowTarget.removeEventListener('focus', handleFocus)
    windowTarget.removeEventListener('pageshow', handlePageShow)
    windowTarget.removeEventListener('online', handleOnline)
  }
}
