import { describe, expect, it } from 'vitest'

import { getChannelCardConfigs, getChannelsListLayoutClasses } from '@/components/channels/channelCards'
import type { Channel } from '@/types/database'

const WHATSAPP_CHANNEL: Channel = {
    id: 'whatsapp-1',
    organization_id: 'org-1',
    type: 'whatsapp',
    name: 'WhatsApp (+90)',
    config: {},
    status: 'active',
    created_at: '2026-02-10T00:00:00.000Z',
    updated_at: '2026-02-10T00:00:00.000Z'
}

describe('getChannelCardConfigs', () => {
    it('marks instagram and messenger cards as coming soon', () => {
        const configs = getChannelCardConfigs([WHATSAPP_CHANNEL])

        const instagramCard = configs.find(config => config.type === 'instagram')
        const messengerCard = configs.find(config => config.type === 'messenger')
        const whatsappCard = configs.find(config => config.type === 'whatsapp')

        expect(instagramCard?.isComingSoon).toBe(true)
        expect(messengerCard?.isComingSoon).toBe(true)
        expect(whatsappCard?.isComingSoon).toBe(false)
    })

    it('keeps messenger card disconnected while preserving known channel mappings', () => {
        const configs = getChannelCardConfigs([WHATSAPP_CHANNEL])
        const messengerCard = configs.find(config => config.type === 'messenger')
        const whatsappCard = configs.find(config => config.type === 'whatsapp')

        expect(messengerCard?.channel).toBeUndefined()
        expect(whatsappCard?.channel?.id).toBe('whatsapp-1')
    })

    it('returns vertical list classes for channels layout', () => {
        const classes = getChannelsListLayoutClasses()

        expect(classes).toContain('flex')
        expect(classes).toContain('flex-col')
        expect(classes).not.toContain('grid-cols')
    })
})
