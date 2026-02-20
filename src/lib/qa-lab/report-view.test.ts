import { describe, expect, it } from 'vitest'

import { parseQaLabRunReportView } from '@/lib/qa-lab/report-view'

describe('parseQaLabRunReportView', () => {
    it('parses kb fixture, extraction setup, and execution details', () => {
        const parsed = parseQaLabRunReportView({
            budget: {
                limit_tokens: 50000,
                consumed_tokens: 13200,
                remaining_tokens: 36800,
                exhausted: false
            },
            generator: {
                fixture_title: 'Diş Kliniği Fixture',
                fixture_line_count: 3,
                fixture_lines: [
                    'Satır 1',
                    'Satır 2',
                    ''
                ],
                ground_truth: {
                    canonical_services: ['İmplant', 'Ortodonti'],
                    required_intake_fields: ['ad_soyad', 'telefon'],
                    critical_policy_facts: ['Pazar kapalı'],
                    disallowed_fabricated_claims: ['SGK tamamen karşılar']
                },
                derived_setup: {
                    offering_profile_summary: 'Diş sağlığı hizmetleri',
                    service_catalog: ['İmplant'],
                    required_intake_fields: ['ad_soyad', 'telefon']
                },
                scenario_mix: {
                    lead_temperature: {
                        hot: 1,
                        warm: 2,
                        cold: 1
                    },
                    information_sharing: {
                        cooperative: 1,
                        partial: 2,
                        resistant: 1
                    }
                }
            },
            execution: {
                cases: [
                    {
                        case_id: 'S1',
                        title: 'Sıcak senaryo',
                        goal: 'Randevuya bağla',
                        customer_profile: 'Hızlı karar veren',
                        lead_temperature: 'hot',
                        information_sharing: 'cooperative',
                        executed_turns: [
                            {
                                turn_index: 1,
                                customer_message: 'Yarın uygun musunuz?',
                                assistant_response: 'Saat 14:00 boş.',
                                token_usage: { total_tokens: 90 }
                            }
                        ]
                    }
                ]
            },
            pipeline_checks: {
                overall: 'pass',
                steps: [
                    { id: 'kb_fixture', order: 1, status: 'pass', note: 'Fixture lines 260/200' },
                    { id: 'derived_setup', order: 2, status: 'pass', note: 'Derived setup healthy' }
                ]
            },
            judge: {
                summary: 'Genel kalite iyi',
                score_breakdown: {
                    groundedness: 90,
                    extraction_accuracy: 82,
                    conversation_quality: 78,
                    weighted_total: 84
                },
                findings: [
                    {
                        severity: 'major',
                        violated_rule: 'required_fields_missing',
                        evidence: 'Telefon bilgisi sorulmadı',
                        rationale: 'Lead handoff zorlaşıyor',
                        suggested_fix: 'Telefonu ikinci turda iste',
                        target_layer: 'pipeline',
                        effort: 'low',
                        confidence: 0.8
                    }
                ],
                top_actions: [
                    {
                        priority: 1,
                        action: 'Sıcak lead’de zorunlu alanları ilk 2 turda topla',
                        target_layer: 'pipeline',
                        expected_impact: 'Lead kalitesi artar',
                        effort: 'low'
                    }
                ]
            }
        })

        expect(parsed.kbFixture.title).toBe('Diş Kliniği Fixture')
        expect(parsed.kbFixture.lineCount).toBe(3)
        expect(parsed.kbFixture.lines).toEqual(['Satır 1', 'Satır 2'])
        expect(parsed.groundTruth.canonicalServices).toEqual(['İmplant', 'Ortodonti'])
        expect(parsed.derivedSetup.serviceCatalog).toEqual(['İmplant'])
        expect(parsed.scenarioMix.hot).toBe(1)
        expect(parsed.pipelineChecks.overall).toBe('pass')
        expect(parsed.pipelineChecks.steps[0]?.id).toBe('kb_fixture')
        expect(parsed.cases[0]?.leadTemperature).toBe('hot')
        expect(parsed.cases[0]?.turns[0]?.assistantResponse).toBe('Saat 14:00 boş.')
        expect(parsed.findings).toHaveLength(1)
        expect(parsed.topActions).toHaveLength(1)
    })

    it('returns safe defaults for malformed input', () => {
        const parsed = parseQaLabRunReportView(null)

        expect(parsed.kbFixture.title).toBe('-')
        expect(parsed.kbFixture.lineCount).toBe(0)
        expect(parsed.kbFixture.lines).toEqual([])
        expect(parsed.groundTruth.canonicalServices).toEqual([])
        expect(parsed.pipelineChecks.steps).toEqual([])
        expect(parsed.cases).toEqual([])
        expect(parsed.findings).toEqual([])
        expect(parsed.topActions).toEqual([])
    })
})
