export type EvaluationQuestionRow = {
    no: number
    question: string
    originalScore: number
}

function readPositiveInteger(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0
        ? value
        : null
}

export function readExcludedPoolIds(artifact: unknown) {
    const record = artifact && typeof artifact === 'object' && !Array.isArray(artifact)
        ? artifact as Record<string, unknown>
        : {}
    const excluded = new Set<number>()

    for (const row of Array.isArray(record.selected) ? record.selected : []) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue
        const poolId = readPositiveInteger((row as Record<string, unknown>).no)
        if (poolId !== null) excluded.add(poolId)
    }

    for (const row of Array.isArray(record.results) ? record.results : []) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue
        const poolId = readPositiveInteger((row as Record<string, unknown>).poolId)
        if (poolId !== null) excluded.add(poolId)
    }

    return excluded
}

export function excludeRowsByPoolId<T extends EvaluationQuestionRow>(rows: T[], excludedPoolIds: ReadonlySet<number>) {
    return rows.filter((row) => !excludedPoolIds.has(row.no))
}
