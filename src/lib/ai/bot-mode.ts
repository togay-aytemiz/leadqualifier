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

export function resolveLeadExtractionAllowance(options: {
    botMode: AiBotMode
    operatorActive: boolean
    allowDuringOperator: boolean
}) {
    const base = resolveBotModeAction(options.botMode).allowLeadExtraction
    if (!base) return false
    if (!options.operatorActive) return true
    return options.allowDuringOperator
}
