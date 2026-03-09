import type { AiBotMode } from '@/types/database'

interface ResolveMainSidebarBotModeOptions {
    botMode: AiBotMode
    isWorkspaceLocked: boolean
}

export function resolveMainSidebarBotMode(
    options: ResolveMainSidebarBotModeOptions
): AiBotMode {
    if (options.isWorkspaceLocked) return 'off'
    return options.botMode
}

export function normalizeMainSidebarBotMode(mode: unknown): AiBotMode {
    if (mode === 'active' || mode === 'shadow' || mode === 'off') {
        return mode
    }
    return 'active'
}

export interface MainSidebarInitialBotModeState {
    botMode: AiBotMode
    isLoading: boolean
}

interface ResolveMainSidebarInitialBotModeStateOptions {
    organizationId: string | null
    initialBotMode?: unknown
}

export function resolveMainSidebarInitialBotModeState(
    options: ResolveMainSidebarInitialBotModeStateOptions
): MainSidebarInitialBotModeState {
    const hasKnownInitialMode =
        options.initialBotMode === 'active'
        || options.initialBotMode === 'shadow'
        || options.initialBotMode === 'off'

    return {
        botMode: normalizeMainSidebarBotMode(options.initialBotMode),
        isLoading: Boolean(options.organizationId) && !hasKnownInitialMode
    }
}

export type MainSidebarBotModeTone = 'emerald' | 'amber' | 'rose'

export function resolveMainSidebarBotModeTone(botMode: AiBotMode): MainSidebarBotModeTone {
    if (botMode === 'shadow') return 'amber'
    if (botMode === 'off') return 'rose'
    return 'emerald'
}
