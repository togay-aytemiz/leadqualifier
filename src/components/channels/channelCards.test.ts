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
    it('builds gallery cards with expected order, tones, and badges', () => {
        const configs = getChannelCardConfigs([WHATSAPP_CHANNEL])

        expect(configs.map(config => config.type)).toEqual([
            'whatsapp',
            'telegram',
            'messenger',
            'instagram'
        ])

        const instagramCard = configs.find(config => config.type === 'instagram')
        const messengerCard = configs.find(config => config.type === 'messenger')
        const telegramCard = configs.find(config => config.type === 'telegram')
        const whatsappCard = configs.find(config => config.type === 'whatsapp')

        expect(whatsappCard?.badge).toBe('popular')
        expect(whatsappCard?.tone).toBe('emerald')
        expect(telegramCard?.tone).toBe('sky')
        expect(telegramCard?.badge).toBeUndefined()
        expect(messengerCard?.badge).toBe('comingSoon')
        expect(messengerCard?.tone).toBe('indigo')
        expect(instagramCard?.isComingSoon).toBe(false)
        expect(instagramCard?.badge).toBeUndefined()
        expect(instagramCard?.tone).toBe('sunset')
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

    it('returns responsive grid classes for gallery layout', () => {
        const classes = getChannelsListLayoutClasses()

        expect(classes).toContain('grid')
        expect(classes).toContain('md:grid-cols-2')
        expect(classes).toContain('xl:grid-cols-3')
        expect(classes).not.toContain('2xl:grid-cols-4')
    })
})
