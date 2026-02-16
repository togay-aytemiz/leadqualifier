import { describe, expect, it } from 'vitest'

import {
    getLatestContactMessageAt,
    resolveWhatsAppReplyWindowState
} from '@/lib/whatsapp/reply-window'

describe('resolveWhatsAppReplyWindowState', () => {
    it('allows replies within 24 hours from latest inbound message', () => {
        const state = resolveWhatsAppReplyWindowState({
            latestInboundAt: '2026-02-16T10:00:00.000Z',
            now: new Date('2026-02-17T09:59:59.000Z')
        })

        expect(state.canReply).toBe(true)
        expect(state.reason).toBe('within_window')
        expect(state.windowClosesAt).toBe('2026-02-17T10:00:00.000Z')
    })

    it('blocks replies after 24 hours from latest inbound message', () => {
        const state = resolveWhatsAppReplyWindowState({
            latestInboundAt: '2026-02-16T10:00:00.000Z',
            now: new Date('2026-02-17T10:00:01.000Z')
        })

        expect(state.canReply).toBe(false)
        expect(state.reason).toBe('window_expired')
    })

    it('blocks replies when no inbound customer message exists', () => {
        const state = resolveWhatsAppReplyWindowState({
            latestInboundAt: null,
            now: new Date('2026-02-16T10:00:00.000Z')
        })

        expect(state.canReply).toBe(false)
        expect(state.reason).toBe('missing_inbound')
        expect(state.windowClosesAt).toBeNull()
    })
})

describe('getLatestContactMessageAt', () => {
    it('returns latest contact message timestamp and ignores non-contact senders', () => {
        const latest = getLatestContactMessageAt([
            { sender_type: 'user', created_at: '2026-02-16T10:00:00.000Z' },
            { sender_type: 'contact', created_at: '2026-02-16T10:05:00.000Z' },
            { sender_type: 'bot', created_at: '2026-02-16T10:06:00.000Z' },
            { sender_type: 'contact', created_at: '2026-02-16T10:08:00.000Z' }
        ])

        expect(latest).toBe('2026-02-16T10:08:00.000Z')
    })
})

