import type { QaLabRunResult } from '@/types/database'

export type QaLabFindingSeverity = 'critical' | 'major' | 'minor'

export interface QaLabScoreInput {
    groundedness: number
    extractionAccuracy: number
    conversationQuality: number
}

export interface QaLabFindingLike {
    severity?: string | null
}

function clampScore(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.min(100, Math.max(0, Math.round(value)))
}

export function toWeightedQaLabScore(input: QaLabScoreInput): number {
    const groundedness = clampScore(input.groundedness)
    const extractionAccuracy = clampScore(input.extractionAccuracy)
    const conversationQuality = clampScore(input.conversationQuality)

    return Math.round(
        groundedness * 0.4
        + extractionAccuracy * 0.35
        + conversationQuality * 0.25
    )
}

export function computeQaLabRunResult(findings: QaLabFindingLike[]): QaLabRunResult {
    const hasCritical = findings.some((finding) => finding.severity === 'critical')
    if (hasCritical) return 'fail_critical'
    if (findings.length > 0) return 'pass_with_findings'
    return 'pass_clean'
}

export function isBudgetExhausted(consumedTokens: number, tokenBudget: number) {
    const consumed = Number.isFinite(consumedTokens) ? consumedTokens : 0
    const budget = Number.isFinite(tokenBudget) ? tokenBudget : 0
    return consumed >= budget
}
