import { describe, expect, it } from 'vitest'

import { getChannelPlatformIconSrc, getConversationPlatformIconSrc } from '@/lib/channels/platform-icons'

describe('getChannelPlatformIconSrc', () => {
    it('returns the public SVG path for each channel platform', () => {
        expect(getChannelPlatformIconSrc('telegram')).toBe('/Telegram.svg')
        expect(getChannelPlatformIconSrc('whatsapp')).toBe('/whatsapp.svg')
        expect(getChannelPlatformIconSrc('instagram')).toBe('/instagram.svg')
        expect(getChannelPlatformIconSrc('messenger')).toBe('/messenger.svg')
    })
})

describe('getConversationPlatformIconSrc', () => {
    it('returns shared SVG paths for channel-backed conversation platforms and null for simulator', () => {
        expect(getConversationPlatformIconSrc('telegram')).toBe('/Telegram.svg')
        expect(getConversationPlatformIconSrc('whatsapp')).toBe('/whatsapp.svg')
        expect(getConversationPlatformIconSrc('instagram')).toBe('/instagram.svg')
        expect(getConversationPlatformIconSrc('simulator')).toBeNull()
    })
})
