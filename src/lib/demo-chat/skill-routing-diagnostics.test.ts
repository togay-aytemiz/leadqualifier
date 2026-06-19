import { describe, expect, it } from 'vitest'

import {
    appendSkillRoutingOutcome,
    markSkillRoutingRagFallback,
    summarizeSkillMatches,
    summarizeSkillRewrite,
    summarizeSkillVerification,
} from './skill-routing-diagnostics'

describe('skill routing diagnostics', () => {
    it('summarizes skill candidates without storing full response text', () => {
        const summary = summarizeSkillMatches([
            {
                skill_id: 'skill-1',
                title: 'YİÜ Intent - 45 spor_antrenorluk_egitimi',
                trigger_text: 'Antrenörlük Eğitimi ücreti ne kadar?',
                response_text: 'long answer that should not be copied into metadata',
                similarity: 0.82,
            },
        ])

        expect(summary).toEqual([
            {
                skillId: 'skill-1',
                title: 'YİÜ Intent - 45 spor_antrenorluk_egitimi',
                trigger: 'Antrenörlük Eğitimi ücreti ne kadar?',
                similarity: 0.82,
            },
        ])
        expect(JSON.stringify(summary)).not.toContain('long answer')
    })

    it('keeps rewrite and verification decisions inspectable', () => {
        const rewrite = summarizeSkillRewrite({
            query: 'Yüksek İhtisas Üniversitesi Antrenörlük Eğitimi ücreti',
            subject: 'Antrenörlük Eğitimi',
            facet: 'ücret',
            needsClarification: false,
            usedHistory: false,
            decision: 'standalone',
            reason: 'Latest message already contains subject and facet.',
            model: 'gpt-4.1-mini',
            usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
        })
        const verification = summarizeSkillVerification({
            decision: 'no_skill',
            match: null,
            confidence: 0.2,
            coverage: 'none',
            reason: 'No candidate directly covers the requested fee.',
            model: 'gpt-4.1-mini',
            usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 },
        })

        expect(rewrite).toMatchObject({
            query: 'Yüksek İhtisas Üniversitesi Antrenörlük Eğitimi ücreti',
            subject: 'Antrenörlük Eğitimi',
            facet: 'ücret',
            decision: 'standalone',
        })
        expect(verification).toMatchObject({
            decision: 'no_skill',
            skillId: null,
            coverage: 'none',
        })
    })

    it('marks RAG fallback without losing the terminal skill-routing outcome', () => {
        expect(markSkillRoutingRagFallback({
            outcome: 'verification_timeout',
            mergedCandidates: [
                {
                    skillId: 'skill-ebelik',
                    title: 'YİÜ Intent - 71 ebelik_program_bilgileri',
                    trigger: 'Ebelik kontenjanı kaç?',
                    similarity: 0.93,
                },
            ],
        })).toEqual({
            outcome: 'verification_timeout',
            ragFallback: true,
            mergedCandidates: [
                {
                    skillId: 'skill-ebelik',
                    title: 'YİÜ Intent - 71 ebelik_program_bilgileri',
                    trigger: 'Ebelik kontenjanı kaç?',
                    similarity: 0.93,
                },
            ],
        })
    })

    it('keeps all relevant coverage facets visible in compact candidate diagnostics', () => {
        const summary = summarizeSkillMatches([
            {
                skill_id: 'skill-1',
                title: 'YİÜ Intent - 71 ebelik_program_bilgileri',
                trigger_text: 'Ebelik kontenjanı kaç?',
                response_text: 'long answer that should not be copied into metadata',
                similarity: 0.93,
                coverage_facets: [
                    'program_existence',
                    'program_overview',
                    'academic_unit',
                    'degree_level',
                    'campus',
                    'address',
                    'point_type',
                    'fee',
                    'quota',
                    'scholarship',
                    'discount',
                    'base_score',
                    'success_rank',
                ],
            },
        ])

        expect(summary[0]?.coverageFacets).toEqual(expect.arrayContaining([
            'fee',
            'quota',
            'base_score',
            'success_rank',
        ]))
    })
})
