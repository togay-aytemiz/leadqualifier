import { describe, expect, it } from 'vitest'

import { buildQaLabPipelineActionSet } from '@/lib/qa-lab/action-set'

describe('qa lab action set', () => {
    it('combines judge findings and top actions into a prioritized pipeline set', () => {
        const report = {
            judge: {
                findings: [
                    {
                        severity: 'critical',
                        violated_rule: 'required_fields_missing',
                        evidence: 'Asistan tarih ve bütçe bilgisini toplamadan teklife geçti.',
                        rationale: 'Eksik intake alanı lead kalitesini düşürüyor.',
                        suggested_fix: 'Required intake alanlarını ilk 2 turda zorunlu sor',
                        target_layer: 'pipeline',
                        effort: 'low',
                        confidence: 0.92
                    },
                    {
                        severity: 'major',
                        violated_rule: 'required_fields_missing',
                        evidence: 'Tekrarlayan vakalarda aynı sorun görüldü.',
                        rationale: 'Aynı sorunun birden fazla varyasyonu var.',
                        suggested_fix: 'Required intake alanlarını ilk 2 turda zorunlu sor',
                        target_layer: 'pipeline',
                        effort: 'medium',
                        confidence: 0.7
                    }
                ],
                top_actions: [
                    {
                        priority: 2,
                        action: 'Fiyat cevabında kesinlik yerine aralık kullan',
                        target_layer: 'prompt',
                        expected_impact: 'Yanlış kesin fiyat verme riski düşer.',
                        effort: 'medium'
                    }
                ]
            }
        }

        const result = buildQaLabPipelineActionSet(report)

        expect(result.items).toHaveLength(2)
        expect(result.items[0]?.title).toBe('Required intake alanlarını ilk 2 turda zorunlu sor')
        expect(result.items[0]?.source).toBe('finding')
        expect(result.items[0]?.severity).toBe('critical')
        expect(result.items[0]?.evidence).toContain('tarih ve bütçe')

        expect(result.summary.total).toBe(2)
        expect(result.summary.criticalCount).toBe(1)
        expect(result.summary.quickWinCount).toBe(1)
        expect(result.summary.byLayer.pipeline).toBe(1)
        expect(result.summary.byLayer.prompt).toBe(1)
    })

    it('returns an empty set when judge output is missing', () => {
        const result = buildQaLabPipelineActionSet({})

        expect(result.items).toEqual([])
        expect(result.summary.total).toBe(0)
        expect(result.summary.criticalCount).toBe(0)
        expect(result.summary.quickWinCount).toBe(0)
        expect(result.summary.byLayer.kb).toBe(0)
        expect(result.summary.byLayer.skill).toBe(0)
        expect(result.summary.byLayer.prompt).toBe(0)
        expect(result.summary.byLayer.pipeline).toBe(0)
    })
})
