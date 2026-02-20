export interface QaLabRunBudgetView {
    limitTokens: number | null
    consumedTokens: number | null
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

export interface QaLabRunReportView {
    budget: QaLabRunBudgetView
    score: QaLabRunScoreView
    summary: string
    kbFixture: QaLabRunKbFixtureView
    groundTruth: QaLabRunGroundTruthView
    derivedSetup: QaLabRunDerivedSetupView
    scenarioMix: QaLabRunScenarioMixView
    pipelineChecks: QaLabRunPipelineChecksView
    findings: QaLabRunFindingView[]
    topActions: QaLabRunTopActionView[]
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

export function parseQaLabRunReportView(report: unknown): QaLabRunReportView {
    const reportRecord = toRecord(report)
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
    const rawCases = Array.isArray(executionRecord.cases) ? executionRecord.cases : []
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
        budget: {
            limitTokens: toNumber(budgetRecord.limit_tokens),
            consumedTokens: toNumber(budgetRecord.consumed_tokens),
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
        pipelineChecks: {
            overall: toPipelineStatus(pipelineChecksRecord.overall),
            steps: pipelineSteps
        },
        summary: toString(judgeRecord.summary, ''),
        findings,
        topActions,
        cases,
        judgeSkippedReason: toString(judgeRecord.skipped_reason, '') || null
    }
}
