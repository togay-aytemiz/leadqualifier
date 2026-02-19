import type { HumanEscalationAction } from '@/types/database'

export type HumanEscalationReason = 'skill_handover' | 'hot_lead'
export type HumanEscalationNoticeMode = 'assistant_promise'

export interface HumanEscalationDecision {
    shouldEscalate: boolean
    reason: HumanEscalationReason | null
    action: HumanEscalationAction | null
    noticeMode: HumanEscalationNoticeMode | null
    noticeMessage: string | null
}

export interface DecideHumanEscalationOptions {
    skillRequiresHumanHandover: boolean
    leadScore: number | null | undefined
    hotLeadThreshold: number
    hotLeadAction: HumanEscalationAction
    handoverMessage: string
}

export const DEFAULT_HANDOVER_MESSAGE_EN =
    "I've notified the team. Since they might be with a client, they'll get back to you as soon as possible."
export const DEFAULT_HANDOVER_MESSAGE_TR =
    'Ekibi bilgilendirdim. Şu anda bir müşteriyle ilgileniyor olabilirler, size en kısa sürede dönüş yapacaklar.'
export const DEFAULT_HANDOVER_MESSAGE = DEFAULT_HANDOVER_MESSAGE_EN

function resolveHandoverMessage(message: string) {
    const trimmed = (message ?? '').trim()
    return trimmed || DEFAULT_HANDOVER_MESSAGE
}

function noEscalation(): HumanEscalationDecision {
    return {
        shouldEscalate: false,
        reason: null,
        action: null,
        noticeMode: null,
        noticeMessage: null
    }
}

export function decideHumanEscalation(options: DecideHumanEscalationOptions): HumanEscalationDecision {
    const message = resolveHandoverMessage(options.handoverMessage)

    if (options.skillRequiresHumanHandover) {
        return {
            shouldEscalate: true,
            reason: 'skill_handover',
            action: 'switch_to_operator',
            noticeMode: 'assistant_promise',
            noticeMessage: message
        }
    }

    const score = typeof options.leadScore === 'number' && Number.isFinite(options.leadScore)
        ? options.leadScore
        : null
    if (score === null || score < options.hotLeadThreshold) {
        return noEscalation()
    }

    const shouldSendAssistantPromise = options.hotLeadAction === 'switch_to_operator'

    return {
        shouldEscalate: true,
        reason: 'hot_lead',
        action: options.hotLeadAction,
        noticeMode: shouldSendAssistantPromise ? 'assistant_promise' : null,
        noticeMessage: shouldSendAssistantPromise ? message : null
    }
}
