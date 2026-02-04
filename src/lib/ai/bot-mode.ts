import type { AiBotMode } from '@/types/database'

export function resolveBotModeAction(botMode: AiBotMode) {
    if (botMode === 'shadow') {
        return { allowReplies: false, allowLeadExtraction: true }
    }
    if (botMode === 'off') {
        return { allowReplies: false, allowLeadExtraction: false }
    }
    return { allowReplies: true, allowLeadExtraction: true }
}
