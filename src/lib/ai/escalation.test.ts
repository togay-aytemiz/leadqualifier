import { describe, expect, it } from 'vitest'
import { decideHumanEscalation } from '@/lib/ai/escalation'

describe('decideHumanEscalation', () => {
    it('forces switch + assistant promise when skill requires handover', () => {
        const result = decideHumanEscalation({
            skillRequiresHumanHandover: true,
            leadScore: 10,
            hotLeadThreshold: 7,
            hotLeadAction: 'notify_only',
            handoverMessage: 'Custom message'
        })

        expect(result).toEqual({
            shouldEscalate: true,
            reason: 'skill_handover',
            action: 'switch_to_operator',
            noticeMode: 'assistant_promise',
            noticeMessage: 'Custom message'
        })
    })

    it('uses hot lead settings when score meets threshold', () => {
        const result = decideHumanEscalation({
            skillRequiresHumanHandover: false,
            leadScore: 7,
            hotLeadThreshold: 7,
            hotLeadAction: 'notify_only',
            handoverMessage: 'Promise message'
        })

        expect(result).toEqual({
            shouldEscalate: true,
            reason: 'hot_lead',
            action: 'notify_only',
            noticeMode: 'assistant_promise',
            noticeMessage: 'Promise message'
        })
    })

    it('returns no escalation when score is below threshold and no skill override', () => {
        const result = decideHumanEscalation({
            skillRequiresHumanHandover: false,
            leadScore: 6,
            hotLeadThreshold: 7,
            hotLeadAction: 'switch_to_operator',
            handoverMessage: 'Promise message'
        })

        expect(result).toEqual({
            shouldEscalate: false,
            reason: null,
            action: null,
            noticeMode: null,
            noticeMessage: null
        })
    })
})
