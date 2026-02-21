export type QaLabPipelineStepStatus = 'pass' | 'warn' | 'fail'

export interface QaLabPipelineCheckStep {
    id: 'kb_fixture' | 'derived_setup' | 'scenario_generation' | 'conversation_execution' | 'judge_evaluation'
    order: number
    status: QaLabPipelineStepStatus
    note: string
}

export interface QaLabPipelineChecks {
    overall: QaLabPipelineStepStatus
    steps: QaLabPipelineCheckStep[]
}

interface BuildQaLabPipelineChecksInput {
    fixtureLineCount: number
    fixtureMinLines: number
    derivedSetup: {
        offeringProfileSummary: string
        serviceCatalogCount: number
        requiredIntakeFieldCount: number
    }
    scenarioCountTarget: number
    scenarioCountGenerated: number
    executedCaseCount: number
    intakeCoverage?: {
        caseCount: number
        readyCaseCount: number
        warnCaseCount: number
        failCaseCount: number
        averageFulfillmentCoverage: number
        hotCooperativeCaseCount: number
        hotCooperativeReadyCount: number
    }
    judgeSkippedReason: string | null
}

function normalizeCount(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.floor(value))
}

function normalizeRatio(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.min(1, Math.max(0, value))
}

export function buildQaLabPipelineChecks(input: BuildQaLabPipelineChecksInput): QaLabPipelineChecks {
    const fixtureLineCount = normalizeCount(input.fixtureLineCount)
    const fixtureMinLines = normalizeCount(input.fixtureMinLines)
    const serviceCatalogCount = normalizeCount(input.derivedSetup.serviceCatalogCount)
    const requiredIntakeFieldCount = normalizeCount(input.derivedSetup.requiredIntakeFieldCount)
    const scenarioCountTarget = normalizeCount(input.scenarioCountTarget)
    const scenarioCountGenerated = normalizeCount(input.scenarioCountGenerated)
    const executedCaseCount = normalizeCount(input.executedCaseCount)
    const hasProfileSummary = input.derivedSetup.offeringProfileSummary.trim().length > 0
    const intakeCaseCount = normalizeCount(input.intakeCoverage?.caseCount ?? 0)
    const intakeReadyCaseCount = normalizeCount(input.intakeCoverage?.readyCaseCount ?? 0)
    const intakeFailCaseCount = normalizeCount(input.intakeCoverage?.failCaseCount ?? 0)
    const hotCooperativeCaseCount = normalizeCount(input.intakeCoverage?.hotCooperativeCaseCount ?? 0)
    const hotCooperativeReadyCount = normalizeCount(input.intakeCoverage?.hotCooperativeReadyCount ?? 0)
    const averageFulfillmentCoverage = normalizeRatio(input.intakeCoverage?.averageFulfillmentCoverage ?? 0)

    const kbFixtureStep: QaLabPipelineCheckStep = {
        id: 'kb_fixture',
        order: 1,
        status: fixtureLineCount >= fixtureMinLines ? 'pass' : 'fail',
        note: fixtureLineCount >= fixtureMinLines
            ? `Fixture lines ${fixtureLineCount}/${fixtureMinLines}`
            : `Fixture lines ${fixtureLineCount}/${fixtureMinLines} below minimum`
    }

    const derivedSetupHealthy = hasProfileSummary || serviceCatalogCount > 0 || requiredIntakeFieldCount > 0
    const derivedSetupStep: QaLabPipelineCheckStep = {
        id: 'derived_setup',
        order: 2,
        status: derivedSetupHealthy ? 'pass' : 'warn',
        note: derivedSetupHealthy
            ? `Profile:${hasProfileSummary ? 'yes' : 'no'} services:${serviceCatalogCount} fields:${requiredIntakeFieldCount}`
            : 'Derived setup is sparse'
    }

    const generationRatio = scenarioCountTarget > 0
        ? scenarioCountGenerated / scenarioCountTarget
        : 0
    const scenarioGenerationStep: QaLabPipelineCheckStep = {
        id: 'scenario_generation',
        order: 3,
        status: generationRatio >= 1 ? 'pass' : 'warn',
        note: `Generated ${scenarioCountGenerated}/${scenarioCountTarget} scenarios`
    }

    const conversationExecutionStatus = (() => {
        if (executedCaseCount <= 0) return 'fail' satisfies QaLabPipelineStepStatus
        if (intakeCaseCount <= 0) return 'pass' satisfies QaLabPipelineStepStatus

        const failRatio = intakeFailCaseCount / Math.max(1, intakeCaseCount)
        const hotCooperativeReadyRatio = hotCooperativeCaseCount > 0
            ? hotCooperativeReadyCount / hotCooperativeCaseCount
            : 1

        if (
            averageFulfillmentCoverage < 0.3
            || failRatio > 0.45
            || hotCooperativeReadyRatio < 0.4
        ) {
            return 'warn' satisfies QaLabPipelineStepStatus
        }

        return 'pass' satisfies QaLabPipelineStepStatus
    })()

    const conversationExecutionNote = intakeCaseCount > 0
        ? `Executed ${executedCaseCount} scenarios; intake avg ${(averageFulfillmentCoverage * 100).toFixed(0)}% ready ${intakeReadyCaseCount}/${intakeCaseCount}`
        : `Executed ${executedCaseCount} scenarios`

    const conversationExecutionStep: QaLabPipelineCheckStep = {
        id: 'conversation_execution',
        order: 4,
        status: conversationExecutionStatus,
        note: conversationExecutionNote
    }

    const judgeEvaluationStep: QaLabPipelineCheckStep = {
        id: 'judge_evaluation',
        order: 5,
        status: input.judgeSkippedReason ? 'warn' : 'pass',
        note: input.judgeSkippedReason
            ? `Judge skipped: ${input.judgeSkippedReason}`
            : 'Judge completed'
    }

    const steps = [
        kbFixtureStep,
        derivedSetupStep,
        scenarioGenerationStep,
        conversationExecutionStep,
        judgeEvaluationStep
    ]

    const overall: QaLabPipelineStepStatus = steps.some((step) => step.status === 'fail')
        ? 'fail'
        : (steps.some((step) => step.status === 'warn') ? 'warn' : 'pass')

    return {
        overall,
        steps
    }
}
