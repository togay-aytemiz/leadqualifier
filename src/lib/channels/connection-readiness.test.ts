import { describe, expect, it } from 'vitest'

import {
    getChannelConnectionState,
    shouldCountChannelAsConnected
} from '@/lib/channels/connection-readiness'
import type { Channel } from '@/types/database'

function createChannel(overrides: Partial<Channel> = {}): Channel {
    return {
        id: 'channel-1',
        organization_id: 'org-1',
        type: 'whatsapp',
        name: 'WhatsApp (+90)',
        config: {},
        status: 'active',
        created_at: '2026-03-18T00:00:00.000Z',
        updated_at: '2026-03-18T00:00:00.000Z',
        ...overrides
    }
}

describe('channel connection readiness', () => {
    it('treats active WhatsApp channels without webhook verification as pending', () => {
        const channel = createChannel({
            config: {
                phone_number_id: 'phone-1',
                webhook_status: 'pending',
                webhook_verified_at: null
            }
        })

        expect(getChannelConnectionState(channel)).toBe('pending')
        expect(shouldCountChannelAsConnected(channel)).toBe(false)
    })

    it('treats verified WhatsApp channels as ready', () => {
        const channel = createChannel({
            config: {
                phone_number_id: 'phone-1',
                webhook_status: 'verified',
                webhook_verified_at: '2026-03-18T10:00:00.000Z'
            }
        })

        expect(getChannelConnectionState(channel)).toBe('ready')
        expect(shouldCountChannelAsConnected(channel)).toBe(true)
    })

    it('keeps non-whatsapp active channels ready', () => {
        const channel = createChannel({
            type: 'telegram',
            config: {
                bot_token: 'token-1'
            }
        })

        expect(getChannelConnectionState(channel)).toBe('ready')
        expect(shouldCountChannelAsConnected(channel)).toBe(true)
    })
})
