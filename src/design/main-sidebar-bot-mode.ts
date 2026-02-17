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
