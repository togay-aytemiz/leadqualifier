import type { AiBotMode } from '@/types/database'

export type InboxActiveAgent = 'ai' | 'operator'

export interface AssistantBannerState {
    tone: 'active' | 'inactive'
    titleKey: 'botActiveTitle' | 'botInactiveShadowTitle' | 'botInactiveOffTitle'
    bodyKey: 'botActiveBody' | 'botInactiveShadowBody' | 'botInactiveOffBody'
}

export function resolveAssistantBanner(options: {
    activeAgent: InboxActiveAgent
    botMode: AiBotMode
}): AssistantBannerState | null {
    if (options.activeAgent === 'operator') return null

    if (options.botMode === 'shadow') {
        return {
            tone: 'inactive',
            titleKey: 'botInactiveShadowTitle',
            bodyKey: 'botInactiveShadowBody'
        }
    }

    if (options.botMode === 'off') {
        return {
            tone: 'inactive',
            titleKey: 'botInactiveOffTitle',
            bodyKey: 'botInactiveOffBody'
        }
    }

    return {
        tone: 'active',
        titleKey: 'botActiveTitle',
        bodyKey: 'botActiveBody'
    }
}
