export interface QaLabRunBudgetView {
    limitTokens: number | null
    consumedTokens: number | null
    consumedInputTokens: number | null
    consumedInputCachedTokens: number | null
    consumedOutputTokens: number | null
    consumedCredits: number | null
    estimatedCostUsd: number | null
    remainingTokens: number | null
    exhausted: boolean | null
}

export interface QaLabRunScoreView {
    groundedness: number | null
    extractionAccuracy: number | null
    conversationQuality: number | null
    weightedTotal: number | null
}

export interface QaLabRunFindingView {
    severity: 'critical' | 'major' | 'minor'
    violatedRule: string
    evidence: string
    rationale: string
    suggestedFix: string
    targetLayer: string
    effort: string
    confidence: number | null
}

export interface QaLabRunTopActionView {
    priority: number | null
    action: string
    targetLayer: string
    expectedImpact: string
    effort: string
}

export interface QaLabRunScenarioAssessmentView {
    caseId: string
    assistantSuccess: 'pass' | 'warn' | 'fail'
    answerQualityScore: number | null
    logicScore: number | null
    groundednessScore: number | null
    summary: string
    strengths: string[]
    issues: string[]
    confidence: number | null
    source: 'judge' | 'fallback'
}

export interface QaLabRunTurnView {
    turnIndex: number | null
    customerMessage: string
    assistantResponse: string
    totalTokens: number | null
}

export interface QaLabRunCaseView {
    caseId: string
    title: string
    goal: string
    customerProfile: string
    leadTemperature: string
    informationSharing: string
    turns: QaLabRunTurnView[]
}

export interface QaLabRunIntakeCoverageTotalsView {
    caseCount: number
    readyCaseCount: number
    warnCaseCount: number
    failCaseCount: number
    averageAskedCoverage: number
    averageFulfillmentCoverage: number
    hotCooperativeCaseCount: number
    hotCooperativeReadyCount: number
}

export interface QaLabRunIntakeCoverageCaseView {
    caseId: string
    title: string
    leadTemperature: string
    informationSharing: string
    requiredFieldsTotal: number
    askedFieldsCount: number
    fulfilledFieldsCount: number
    askedCoverage: number
    fulfillmentCoverage: number
    handoffReadiness: 'pass' | 'warn' | 'fail'
    missingFields: string[]
}

export interface QaLabRunIntakeCoverageView {
    requiredFields: string[]
    totals: QaLabRunIntakeCoverageTotalsView
    byCase: QaLabRunIntakeCoverageCaseView[]
    topMissingFields: Array<{
        field: string
        count: number
    }>
}

export interface QaLabRunKbFixtureView {
    title: string
    lineCount: number
    lines: string[]
}

export interface QaLabRunGroundTruthView {
    canonicalServices: string[]
    requiredIntakeFields: string[]
    criticalPolicyFacts: string[]
    disallowedFabricatedClaims: string[]
}

export interface QaLabRunDerivedSetupView {
    offeringProfileSummary: string
    serviceCatalog: string[]
    requiredIntakeFields: string[]
}

export interface QaLabRunScenarioMixView {
    hot: number | null
    warm: number | null
    cold: number | null
    cooperative: number | null
    partial: number | null
    resistant: number | null
}

export interface QaLabRunPipelineCheckStepView {
    id: string
    order: number | null
    status: 'pass' | 'warn' | 'fail'
    note: string
}

export interface QaLabRunPipelineChecksView {
    overall: 'pass' | 'warn' | 'fail'
    steps: QaLabRunPipelineCheckStepView[]
}

export interface QaLabAssistantProfileView {
    assistantId: string
    profileVersion: string
    isolation: string
    autoPortToLive: boolean | null
}

export interface QaLabRunReportView {
    qaAssistantProfile: QaLabAssistantProfileView
    budget: QaLabRunBudgetView
    score: QaLabRunScoreView
    summary: string
    kbFixture: QaLabRunKbFixtureView
    groundTruth: QaLabRunGroundTruthView
    derivedSetup: QaLabRunDerivedSetupView
    scenarioMix: QaLabRunScenarioMixView
    intakeCoverage: QaLabRunIntakeCoverageView
    pipelineChecks: QaLabRunPipelineChecksView
    findings: QaLabRunFindingView[]
    topActions: QaLabRunTopActionView[]
    scenarioAssessments: QaLabRunScenarioAssessmentView[]
    cases: QaLabRunCaseView[]
    judgeSkippedReason: string | null
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function toString(value: unknown, fallback = '') {
    if (typeof value !== 'string') return fallback
    const trimmed = value.trim()
    return trimmed || fallback
}

function toNumber(value: unknown): number | null {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return null
    return numeric
}

function toBoolean(value: unknown): boolean | null {
    if (typeof value !== 'boolean') return null
    return value
}

function toStringArray(value: unknown) {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => (typeof item === 'string' ? item : ''))
        .filter((item) => item.length > 0)
}

function toPipelineStatus(value: unknown): 'pass' | 'warn' | 'fail' {
    if (value === 'pass' || value === 'warn' || value === 'fail') return value
    return 'warn'
}

function toIntakeReadiness(value: unknown): 'pass' | 'warn' | 'fail' {
    if (value === 'pass' || value === 'warn' || value === 'fail') return value
    return 'warn'
}

function toScenarioAssessmentSource(value: unknown): 'judge' | 'fallback' {
    if (value === 'judge' || value === 'fallback') return value
    return 'judge'
}

export function parseQaLabRunReportView(report: unknown): QaLabRunReportView {
    const reportRecord = toRecord(report)
    const qaAssistantProfileRecord = toRecord(reportRecord.qa_assistant_profile)
    const budgetRecord = toRecord(reportRecord.budget)
    const pipelineChecksRecord = toRecord(reportRecord.pipeline_checks)
    const judgeRecord = toRecord(reportRecord.judge)
    const scoreRecord = toRecord(judgeRecord.score_breakdown)
    const generatorRecord = toRecord(reportRecord.generator)
    const groundTruthRecord = toRecord(generatorRecord.ground_truth)
    const derivedSetupRecord = toRecord(generatorRecord.derived_setup)
    const scenarioMixRecord = toRecord(generatorRecord.scenario_mix)
    const scenarioMixLeadTemperature = toRecord(scenarioMixRecord.lead_temperature)
    const scenarioMixInformationSharing = toRecord(scenarioMixRecord.information_sharing)
    const executionRecord = toRecord(reportRecord.execution)
    const rawFindings = Array.isArray(judgeRecord.findings) ? judgeRecord.findings : []
    const rawTopActions = Array.isArray(judgeRecord.top_actions) ? judgeRecord.top_actions : []
    const rawScenarioAssessments = Array.isArray(judgeRecord.scenario_assessments)
        ? judgeRecord.scenario_assessments
        : []
    const rawCases = Array.isArray(executionRecord.cases) ? executionRecord.cases : []
    const intakeCoverageRecord = toRecord(executionRecord.intake_coverage)
    const intakeCoverageTotalsRecord = toRecord(intakeCoverageRecord.totals)
    const rawIntakeCoverageByCase = Array.isArray(intakeCoverageRecord.by_case) ? intakeCoverageRecord.by_case : []
    const rawTopMissingFields = Array.isArray(intakeCoverageRecord.top_missing_fields) ? intakeCoverageRecord.top_missing_fields : []
    const rawPipelineSteps = Array.isArray(pipelineChecksRecord.steps) ? pipelineChecksRecord.steps : []
    const fixtureLines = toStringArray(generatorRecord.fixture_lines)

    const findings = rawFindings
        .map((rawFinding) => {
            const finding = toRecord(rawFinding)
            const severity = toString(finding.severity, 'minor')
            return {
                severity: severity === 'critical' || severity === 'major' || severity === 'minor'
                    ? severity
                    : 'minor',
                violatedRule: toString(finding.violated_rule, '-'),
                evidence: toString(finding.evidence, '-'),
                rationale: toString(finding.rationale, '-'),
                suggestedFix: toString(finding.suggested_fix, '-'),
                targetLayer: toString(finding.target_layer, '-'),
                effort: toString(finding.effort, '-'),
                confidence: toNumber(finding.confidence)
            } satisfies QaLabRunFindingView
        })

    const topActions = rawTopActions
        .map((rawAction) => {
            const action = toRecord(rawAction)
            return {
                priority: toNumber(action.priority),
                action: toString(action.action, '-'),
                targetLayer: toString(action.target_layer, '-'),
                expectedImpact: toString(action.expected_impact, '-'),
                effort: toString(action.effort, '-')
            } satisfies QaLabRunTopActionView
        })

    const scenarioAssessments = rawScenarioAssessments
        .map((rawAssessment) => {
            const assessment = toRecord(rawAssessment)
            return {
                caseId: toString(assessment.case_id, '-'),
                assistantSuccess: toIntakeReadiness(assessment.assistant_success),
                answerQualityScore: toNumber(assessment.answer_quality_score),
                logicScore: toNumber(assessment.logic_score),
                groundednessScore: toNumber(assessment.groundedness_score),
                summary: toString(assessment.summary, '-'),
                strengths: toStringArray(assessment.strengths),
                issues: toStringArray(assessment.issues),
                confidence: toNumber(assessment.confidence),
                source: toScenarioAssessmentSource(assessment.source)
            } satisfies QaLabRunScenarioAssessmentView
        })
        .filter((assessment) => assessment.caseId !== '-')

    const cases = rawCases
        .map((rawCase) => {
            const caseRecord = toRecord(rawCase)
            const rawTurns = Array.isArray(caseRecord.executed_turns) ? caseRecord.executed_turns : []
            const turns = rawTurns.map((rawTurn) => {
                const turnRecord = toRecord(rawTurn)
                const tokenUsage = toRecord(turnRecord.token_usage)
                return {
                    turnIndex: toNumber(turnRecord.turn_index),
                    customerMessage: toString(turnRecord.customer_message, '-'),
                    assistantResponse: toString(turnRecord.assistant_response, '-'),
                    totalTokens: toNumber(tokenUsage.total_tokens)
                } satisfies QaLabRunTurnView
            })

            return {
                caseId: toString(caseRecord.case_id, '-'),
                title: toString(caseRecord.title, '-'),
                goal: toString(caseRecord.goal, '-'),
                customerProfile: toString(caseRecord.customer_profile, '-'),
                leadTemperature: toString(caseRecord.lead_temperature, 'warm'),
                informationSharing: toString(caseRecord.information_sharing, 'partial'),
                turns
            } satisfies QaLabRunCaseView
        })

    const intakeCoverageByCase = rawIntakeCoverageByCase
        .map((rawCaseCoverage) => {
            const caseCoverageRecord = toRecord(rawCaseCoverage)
            return {
                caseId: toString(caseCoverageRecord.case_id, '-'),
                title: toString(caseCoverageRecord.title, '-'),
                leadTemperature: toString(caseCoverageRecord.lead_temperature, 'warm'),
                informationSharing: toString(caseCoverageRecord.information_sharing, 'partial'),
                requiredFieldsTotal: toNumber(caseCoverageRecord.required_fields_total) ?? 0,
                askedFieldsCount: toNumber(caseCoverageRecord.asked_fields_count) ?? 0,
                fulfilledFieldsCount: toNumber(caseCoverageRecord.fulfilled_fields_count) ?? 0,
                askedCoverage: toNumber(caseCoverageRecord.asked_coverage) ?? 0,
                fulfillmentCoverage: toNumber(caseCoverageRecord.fulfillment_coverage) ?? 0,
                handoffReadiness: toIntakeReadiness(caseCoverageRecord.handoff_readiness),
                missingFields: toStringArray(caseCoverageRecord.missing_fields)
            } satisfies QaLabRunIntakeCoverageCaseView
        })

    const topMissingFields = rawTopMissingFields
        .map((rawItem) => {
            const itemRecord = toRecord(rawItem)
            return {
                field: toString(itemRecord.field, '-'),
                count: toNumber(itemRecord.count) ?? 0
            }
        })
        .filter((item) => item.field !== '-')

    const pipelineSteps = rawPipelineSteps
        .map((rawStep) => {
            const step = toRecord(rawStep)
            return {
                id: toString(step.id, '-'),
                order: toNumber(step.order),
                status: toPipelineStatus(step.status),
                note: toString(step.note, '-')
            } satisfies QaLabRunPipelineCheckStepView
        })

    return {
        qaAssistantProfile: {
            assistantId: toString(qaAssistantProfileRecord.assistant_id, '-'),
            profileVersion: toString(qaAssistantProfileRecord.profile_version, '-'),
            isolation: toString(qaAssistantProfileRecord.isolation, '-'),
            autoPortToLive: toBoolean(qaAssistantProfileRecord.auto_port_to_live)
        },
        budget: {
            limitTokens: toNumber(budgetRecord.limit_tokens),
            consumedTokens: toNumber(budgetRecord.consumed_tokens),
            consumedInputTokens: toNumber(budgetRecord.consumed_input_tokens),
            consumedInputCachedTokens: toNumber(budgetRecord.consumed_input_cached_tokens),
            consumedOutputTokens: toNumber(budgetRecord.consumed_output_tokens),
            consumedCredits: toNumber(budgetRecord.consumed_credits),
            estimatedCostUsd: toNumber(budgetRecord.estimated_cost_usd),
            remainingTokens: toNumber(budgetRecord.remaining_tokens),
            exhausted: toBoolean(budgetRecord.exhausted)
        },
        score: {
            groundedness: toNumber(scoreRecord.groundedness),
            extractionAccuracy: toNumber(scoreRecord.extraction_accuracy),
            conversationQuality: toNumber(scoreRecord.conversation_quality),
            weightedTotal: toNumber(scoreRecord.weighted_total)
        },
        kbFixture: {
            title: toString(generatorRecord.fixture_title, '-'),
            lineCount: toNumber(generatorRecord.fixture_line_count) ?? fixtureLines.length,
            lines: fixtureLines
        },
        groundTruth: {
            canonicalServices: toStringArray(groundTruthRecord.canonical_services),
            requiredIntakeFields: toStringArray(groundTruthRecord.required_intake_fields),
            criticalPolicyFacts: toStringArray(groundTruthRecord.critical_policy_facts),
            disallowedFabricatedClaims: toStringArray(groundTruthRecord.disallowed_fabricated_claims)
        },
        derivedSetup: {
            offeringProfileSummary: toString(
                derivedSetupRecord.offering_profile_summary,
                toString(generatorRecord.fixture_title, '')
            ),
            serviceCatalog: toStringArray(derivedSetupRecord.service_catalog),
            requiredIntakeFields: toStringArray(derivedSetupRecord.required_intake_fields)
        },
        scenarioMix: {
            hot: toNumber(scenarioMixLeadTemperature.hot),
            warm: toNumber(scenarioMixLeadTemperature.warm),
            cold: toNumber(scenarioMixLeadTemperature.cold),
            cooperative: toNumber(scenarioMixInformationSharing.cooperative),
            partial: toNumber(scenarioMixInformationSharing.partial),
            resistant: toNumber(scenarioMixInformationSharing.resistant)
        },
        intakeCoverage: {
            requiredFields: toStringArray(intakeCoverageRecord.required_fields),
            totals: {
                caseCount: toNumber(intakeCoverageTotalsRecord.case_count) ?? 0,
                readyCaseCount: toNumber(intakeCoverageTotalsRecord.ready_case_count) ?? 0,
                warnCaseCount: toNumber(intakeCoverageTotalsRecord.warn_case_count) ?? 0,
                failCaseCount: toNumber(intakeCoverageTotalsRecord.fail_case_count) ?? 0,
                averageAskedCoverage: toNumber(intakeCoverageTotalsRecord.average_asked_coverage) ?? 0,
                averageFulfillmentCoverage: toNumber(intakeCoverageTotalsRecord.average_fulfillment_coverage) ?? 0,
                hotCooperativeCaseCount: toNumber(intakeCoverageTotalsRecord.hot_cooperative_case_count) ?? 0,
                hotCooperativeReadyCount: toNumber(intakeCoverageTotalsRecord.hot_cooperative_ready_count) ?? 0
            },
            byCase: intakeCoverageByCase,
            topMissingFields
        },
        pipelineChecks: {
            overall: toPipelineStatus(pipelineChecksRecord.overall),
            steps: pipelineSteps
        },
        summary: toString(judgeRecord.summary, ''),
        findings,
        topActions,
        scenarioAssessments,
        cases,
        judgeSkippedReason: toString(judgeRecord.skipped_reason, '') || null
    }
}
