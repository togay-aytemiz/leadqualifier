export const LEGACY_QA_RUNS_FIXTURE_MIN_LINES = 200

export function isLegacyFixtureMinConstraintError(message: string | null | undefined) {
    if (!message) return false
    return message.includes('qa_runs_fixture_min_lines_check')
        || message.includes('qa_runs_fixture_min_lines_min_200_chk')
}

export function getCompatFixtureMinLinesForInsert(
    requestedFixtureMinLines: number,
    errorMessage: string | null | undefined
) {
    if (!isLegacyFixtureMinConstraintError(errorMessage)) {
        return requestedFixtureMinLines
    }
    return Math.max(requestedFixtureMinLines, LEGACY_QA_RUNS_FIXTURE_MIN_LINES)
}
