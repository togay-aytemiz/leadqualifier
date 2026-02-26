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

export type MainSidebarBotModeTone = 'emerald' | 'amber' | 'rose'

export function resolveMainSidebarBotModeTone(botMode: AiBotMode): MainSidebarBotModeTone {
    if (botMode === 'shadow') return 'amber'
    if (botMode === 'off') return 'rose'
    return 'emerald'
}
