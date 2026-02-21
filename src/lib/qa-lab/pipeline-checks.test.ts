import { describe, expect, it } from 'vitest'

import { buildQaLabPipelineChecks } from '@/lib/qa-lab/pipeline-checks'

describe('buildQaLabPipelineChecks', () => {
    it('returns pass when all sequential stages are healthy', () => {
        const result = buildQaLabPipelineChecks({
            fixtureLineCount: 260,
            fixtureMinLines: 200,
            derivedSetup: {
                offeringProfileSummary: 'Diş kliniği hizmetleri',
                serviceCatalogCount: 8,
                requiredIntakeFieldCount: 6
            },
            scenarioCountTarget: 12,
            scenarioCountGenerated: 12,
            executedCaseCount: 12,
            judgeSkippedReason: null
        })

        expect(result.overall).toBe('pass')
        expect(result.steps).toHaveLength(5)
        expect(result.steps[0]?.status).toBe('pass')
        expect(result.steps[4]?.status).toBe('pass')
    })

    it('returns warn/fail when sequential stages degrade', () => {
        const result = buildQaLabPipelineChecks({
            fixtureLineCount: 120,
            fixtureMinLines: 200,
            derivedSetup: {
                offeringProfileSummary: '',
                serviceCatalogCount: 0,
                requiredIntakeFieldCount: 0
            },
            scenarioCountTarget: 24,
            scenarioCountGenerated: 10,
            executedCaseCount: 0,
            judgeSkippedReason: 'no_cases_executed'
        })

        expect(result.overall).toBe('fail')
        expect(result.steps[0]?.status).toBe('fail')
        expect(result.steps[1]?.status).toBe('warn')
        expect(result.steps[2]?.status).toBe('warn')
        expect(result.steps[3]?.status).toBe('fail')
        expect(result.steps[4]?.status).toBe('warn')
    })

    it('warns conversation execution step when intake fulfillment coverage is weak', () => {
        const result = buildQaLabPipelineChecks({
            fixtureLineCount: 200,
            fixtureMinLines: 150,
            derivedSetup: {
                offeringProfileSummary: 'Psikolojik danismanlik',
                serviceCatalogCount: 3,
                requiredIntakeFieldCount: 5
            },
            scenarioCountTarget: 20,
            scenarioCountGenerated: 20,
            executedCaseCount: 20,
            intakeCoverage: {
                caseCount: 20,
                readyCaseCount: 4,
                warnCaseCount: 6,
                failCaseCount: 10,
                averageFulfillmentCoverage: 0.22,
                hotCooperativeCaseCount: 8,
                hotCooperativeReadyCount: 2
            },
            judgeSkippedReason: null
        })

        expect(result.overall).toBe('warn')
        expect(result.steps[3]?.status).toBe('warn')
        expect(result.steps[3]?.note).toContain('intake')
    })
})
