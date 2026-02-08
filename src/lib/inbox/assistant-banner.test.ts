import { describe, expect, it } from 'vitest'

import { resolveAssistantBanner } from '@/lib/inbox/assistant-banner'

describe('resolveAssistantBanner', () => {
    it('hides banner when operator is active', () => {
        const result = resolveAssistantBanner({
            activeAgent: 'operator',
            botMode: 'active'
        })

        expect(result).toBeNull()
    })

    it('shows active AI banner in active mode', () => {
        const result = resolveAssistantBanner({
            activeAgent: 'ai',
            botMode: 'active'
        })

        expect(result).toMatchObject({
            tone: 'active',
            titleKey: 'botActiveTitle',
            bodyKey: 'botActiveBody'
        })
    })

    it('shows inactive AI banner in shadow mode', () => {
        const result = resolveAssistantBanner({
            activeAgent: 'ai',
            botMode: 'shadow'
        })

        expect(result).toMatchObject({
            tone: 'inactive',
            titleKey: 'botInactiveShadowTitle',
            bodyKey: 'botInactiveShadowBody'
        })
    })

    it('shows inactive AI banner in off mode', () => {
        const result = resolveAssistantBanner({
            activeAgent: 'ai',
            botMode: 'off'
        })

        expect(result).toMatchObject({
            tone: 'inactive',
            titleKey: 'botInactiveOffTitle',
            bodyKey: 'botInactiveOffBody'
        })
    })
})
