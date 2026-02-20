type QaLabActionTargetLayer = 'kb' | 'skill' | 'prompt' | 'pipeline'
type QaLabActionSeverity = 'critical' | 'major' | 'minor'
type QaLabActionEffort = 'low' | 'medium' | 'high'
type QaLabActionSource = 'top_action' | 'finding' | 'combined'

export interface QaLabPipelineActionItem {
    id: string
    priority: number
    title: string
    targetLayer: QaLabActionTargetLayer
    source: QaLabActionSource
    severity: QaLabActionSeverity
    effort: QaLabActionEffort
    expectedImpact: string
    rationale: string
    evidence: string
    confidence: number | null
}

interface QaLabPipelineActionItemDraft extends Omit<QaLabPipelineActionItem, 'priority'> {
    priorityScore: number
}

interface QaLabPipelineActionByLayerSummary {
    kb: number
    skill: number
    prompt: number
    pipeline: number
}

export interface QaLabPipelineActionSummary {
    total: number
    criticalCount: number
    quickWinCount: number
    byLayer: QaLabPipelineActionByLayerSummary
}

export interface QaLabPipelineActionSet {
    items: QaLabPipelineActionItem[]
    summary: QaLabPipelineActionSummary
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

function toNumber(value: unknown) {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return null
    return numeric
}

function normalizeLayer(value: unknown): QaLabActionTargetLayer {
    if (value === 'kb' || value === 'skill' || value === 'prompt' || value === 'pipeline') {
        return value
    }
    return 'pipeline'
}

function normalizeSeverity(value: unknown): QaLabActionSeverity {
    if (value === 'critical' || value === 'major' || value === 'minor') {
        return value
    }
    return 'minor'
}

function normalizeEffort(value: unknown): QaLabActionEffort {
    if (value === 'low' || value === 'medium' || value === 'high') {
        return value
    }
    return 'medium'
}

function normalizeConfidence(value: unknown): number | null {
    const numeric = toNumber(value)
    if (numeric === null) return null
    return Math.max(0, Math.min(1, Number(numeric.toFixed(2))))
}

function buildDedupKey(layer: QaLabActionTargetLayer, title: string) {
    return `${layer}:${title.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()}`
}

function sanitizeIdPart(value: string) {
    return value
        .toLocaleLowerCase('tr')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
}

function severityWeight(severity: QaLabActionSeverity) {
    switch (severity) {
    case 'critical':
        return 0
    case 'major':
        return 25
    case 'minor':
        return 45
    default:
        return 45
    }
}

function effortWeight(effort: QaLabActionEffort) {
    switch (effort) {
    case 'low':
        return 0
    case 'medium':
        return 6
    case 'high':
        return 12
    default:
        return 6
    }
}

function sourceWeight(source: QaLabActionSource) {
    switch (source) {
    case 'combined':
        return 0
    case 'finding':
        return 2
    case 'top_action':
        return 4
    default:
        return 4
    }
}

function computeFindingPriorityScore(options: {
    severity: QaLabActionSeverity
    effort: QaLabActionEffort
    confidence: number | null
}) {
    const confidencePenalty = options.confidence === null
        ? 4
        : Math.round((1 - options.confidence) * 10)

    return severityWeight(options.severity)
        + effortWeight(options.effort)
        + confidencePenalty
}

function computeTopActionPriorityScore(priority: number, effort: QaLabActionEffort) {
    const normalizedPriority = Math.max(1, Math.min(20, Math.floor(priority)))
    return 12 + (normalizedPriority - 1) * 8 + effortWeight(effort)
}

function severityRank(value: QaLabActionSeverity) {
    switch (value) {
    case 'critical':
        return 0
    case 'major':
        return 1
    case 'minor':
        return 2
    default:
        return 2
    }
}

function effortRank(value: QaLabActionEffort) {
    switch (value) {
    case 'low':
        return 0
    case 'medium':
        return 1
    case 'high':
        return 2
    default:
        return 1
    }
}

function pickStrongerSeverity(
    left: QaLabActionSeverity,
    right: QaLabActionSeverity
): QaLabActionSeverity {
    return severityRank(left) <= severityRank(right) ? left : right
}

function pickLowerEffort(
    left: QaLabActionEffort,
    right: QaLabActionEffort
): QaLabActionEffort {
    return effortRank(left) <= effortRank(right) ? left : right
}

function joinUniqueText(values: string[]) {
    const uniqueValues = Array.from(
        new Set(
            values
                .map((value) => value.trim())
                .filter(Boolean)
        )
    )

    return uniqueValues.join(' | ')
}

function mergeDrafts(
    current: QaLabPipelineActionItemDraft,
    incoming: QaLabPipelineActionItemDraft
): QaLabPipelineActionItemDraft {
    const mergedSource: QaLabActionSource = current.source === incoming.source
        ? current.source
        : 'combined'

    return {
        id: current.id,
        title: current.title,
        targetLayer: current.targetLayer,
        source: mergedSource,
        severity: pickStrongerSeverity(current.severity, incoming.severity),
        effort: pickLowerEffort(current.effort, incoming.effort),
        expectedImpact: joinUniqueText([current.expectedImpact, incoming.expectedImpact]),
        rationale: joinUniqueText([current.rationale, incoming.rationale]),
        evidence: joinUniqueText([current.evidence, incoming.evidence]),
        confidence: current.confidence === null
            ? incoming.confidence
            : (incoming.confidence === null ? current.confidence : Math.max(current.confidence, incoming.confidence)),
        priorityScore: Math.min(current.priorityScore, incoming.priorityScore)
    }
}

function toSummary(items: QaLabPipelineActionItem[]): QaLabPipelineActionSummary {
    const byLayer: QaLabPipelineActionByLayerSummary = {
        kb: 0,
        skill: 0,
        prompt: 0,
        pipeline: 0
    }

    let criticalCount = 0
    let quickWinCount = 0

    for (const item of items) {
        byLayer[item.targetLayer] += 1
        if (item.severity === 'critical') criticalCount += 1
        if (item.effort === 'low') quickWinCount += 1
    }

    return {
        total: items.length,
        criticalCount,
        quickWinCount,
        byLayer
    }
}

function readJudgePayload(report: unknown) {
    const reportRecord = toRecord(report)
    const judgeRecord = toRecord(reportRecord.judge)
    const findings = Array.isArray(judgeRecord.findings) ? judgeRecord.findings : []
    const topActions = Array.isArray(judgeRecord.top_actions) ? judgeRecord.top_actions : []

    return {
        findings,
        topActions
    }
}

export function buildQaLabPipelineActionSet(report: unknown): QaLabPipelineActionSet {
    const { findings, topActions } = readJudgePayload(report)
    const draftByKey = new Map<string, QaLabPipelineActionItemDraft>()

    for (let index = 0; index < findings.length; index += 1) {
        const findingRecord = toRecord(findings[index])
        const layer = normalizeLayer(findingRecord.target_layer)
        const severity = normalizeSeverity(findingRecord.severity)
        const effort = normalizeEffort(findingRecord.effort)
        const confidence = normalizeConfidence(findingRecord.confidence)
        const title = toString(
            findingRecord.suggested_fix,
            toString(findingRecord.violated_rule, `finding_${index + 1}`)
        )
        const key = buildDedupKey(layer, title)
        const draft: QaLabPipelineActionItemDraft = {
            id: `${layer}-${sanitizeIdPart(title)}-${index + 1}`,
            title,
            targetLayer: layer,
            source: 'finding',
            severity,
            effort,
            expectedImpact: toString(findingRecord.rationale, 'Judge finding impact not specified.'),
            rationale: toString(findingRecord.rationale, 'No rationale provided.'),
            evidence: toString(findingRecord.evidence, ''),
            confidence,
            priorityScore: computeFindingPriorityScore({
                severity,
                effort,
                confidence
            })
        }

        const current = draftByKey.get(key)
        draftByKey.set(key, current ? mergeDrafts(current, draft) : draft)
    }

    for (let index = 0; index < topActions.length; index += 1) {
        const actionRecord = toRecord(topActions[index])
        const title = toString(actionRecord.action, '')
        if (!title) continue

        const layer = normalizeLayer(actionRecord.target_layer)
        const effort = normalizeEffort(actionRecord.effort)
        const priority = Math.max(1, Math.min(20, Math.floor(toNumber(actionRecord.priority) ?? index + 1)))
        const key = buildDedupKey(layer, title)
        const draft: QaLabPipelineActionItemDraft = {
            id: `${layer}-${sanitizeIdPart(title)}-top-${index + 1}`,
            title,
            targetLayer: layer,
            source: 'top_action',
            severity: 'major',
            effort,
            expectedImpact: toString(actionRecord.expected_impact, 'Judge expected impact not provided.'),
            rationale: toString(actionRecord.expected_impact, ''),
            evidence: '',
            confidence: null,
            priorityScore: computeTopActionPriorityScore(priority, effort)
        }

        const current = draftByKey.get(key)
        draftByKey.set(key, current ? mergeDrafts(current, draft) : draft)
    }

    const sortedDrafts = Array.from(draftByKey.values())
        .sort((left, right) => {
            const priorityDiff = left.priorityScore - right.priorityScore
            if (priorityDiff !== 0) return priorityDiff

            const severityDiff = severityRank(left.severity) - severityRank(right.severity)
            if (severityDiff !== 0) return severityDiff

            const sourceDiff = sourceWeight(left.source) - sourceWeight(right.source)
            if (sourceDiff !== 0) return sourceDiff

            return left.title.localeCompare(right.title, 'tr')
        })
        .slice(0, 12)

    const items = sortedDrafts.map((draft, index) => ({
        id: draft.id,
        priority: index + 1,
        title: draft.title,
        targetLayer: draft.targetLayer,
        source: draft.source,
        severity: draft.severity,
        effort: draft.effort,
        expectedImpact: draft.expectedImpact,
        rationale: draft.rationale,
        evidence: draft.evidence,
        confidence: draft.confidence
    }))

    return {
        items,
        summary: toSummary(items)
    }
}
