import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attachInboxRealtimeRecoveryListeners,
  shouldRecoverInboxRealtime,
} from '@/components/inbox/inboxRealtimeRecovery'

type Listener = () => void

class TestEventTarget {
  private listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback =
      typeof listener === 'function'
        ? (listener as Listener)
        : ((() => listener.handleEvent(new Event(type))) as Listener)
    const existing = this.listeners.get(type) ?? new Set<Listener>()
    existing.add(callback)
    this.listeners.set(type, existing)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback =
      typeof listener === 'function'
        ? (listener as Listener)
        : ((() => listener.handleEvent(new Event(type))) as Listener)
    const existing = this.listeners.get(type)
    if (!existing) return
    existing.delete(callback)
    if (existing.size === 0) {
      this.listeners.delete(type)
    }
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener()
    }
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0
  }
}

class TestDocumentTarget extends TestEventTarget {
  visibilityState: DocumentVisibilityState = 'hidden'
}

afterEach(() => {
  vi.useRealTimers()
})

describe('shouldRecoverInboxRealtime', () => {
  it('restarts recovery only for broken channel states', () => {
    expect(shouldRecoverInboxRealtime('CHANNEL_ERROR')).toBe(true)
    expect(shouldRecoverInboxRealtime('TIMED_OUT')).toBe(true)
    expect(shouldRecoverInboxRealtime('CLOSED')).toBe(true)
    expect(shouldRecoverInboxRealtime('SUBSCRIBED')).toBe(false)
  })
})

describe('attachInboxRealtimeRecoveryListeners', () => {
  it('resyncs only when the document becomes visible', () => {
    const documentTarget = new TestDocumentTarget()
    const windowTarget = new TestEventTarget()
    const onRecover = vi.fn()

    const cleanup = attachInboxRealtimeRecoveryListeners({
      documentTarget,
      windowTarget,
      onRecover,
      throttleMs: 0,
    })

    documentTarget.visibilityState = 'hidden'
    documentTarget.dispatch('visibilitychange')
    expect(onRecover).not.toHaveBeenCalled()

    documentTarget.visibilityState = 'visible'
    documentTarget.dispatch('visibilitychange')
    expect(onRecover).toHaveBeenCalledTimes(1)
    expect(onRecover).toHaveBeenCalledWith('visibilitychange')

    cleanup()
  })

  it('throttles burst recovery signals and removes listeners on cleanup', () => {
    vi.useFakeTimers()

    const documentTarget = new TestDocumentTarget()
    documentTarget.visibilityState = 'visible'
    const windowTarget = new TestEventTarget()
    const onRecover = vi.fn()

    const cleanup = attachInboxRealtimeRecoveryListeners({
      documentTarget,
      windowTarget,
      onRecover,
      throttleMs: 1000,
    })

    windowTarget.dispatch('focus')
    windowTarget.dispatch('pageshow')
    windowTarget.dispatch('online')

    expect(onRecover).toHaveBeenCalledTimes(1)
    expect(onRecover).toHaveBeenCalledWith('focus')

    vi.advanceTimersByTime(1000)
    expect(onRecover).toHaveBeenCalledTimes(2)

    cleanup()

    expect(documentTarget.listenerCount('visibilitychange')).toBe(0)
    expect(windowTarget.listenerCount('focus')).toBe(0)
    expect(windowTarget.listenerCount('pageshow')).toBe(0)
    expect(windowTarget.listenerCount('online')).toBe(0)

    windowTarget.dispatch('focus')
    documentTarget.dispatch('visibilitychange')

    expect(onRecover).toHaveBeenCalledTimes(2)
  })
})
