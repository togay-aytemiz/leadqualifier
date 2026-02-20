import { describe, expect, it } from 'vitest'

import {
    getCompatFixtureMinLinesForInsert,
    LEGACY_QA_RUNS_FIXTURE_MIN_LINES
} from '@/lib/qa-lab/run-insert-compat'

describe('qa lab run fixture-min compatibility', () => {
    it('keeps requested fixture minimum when no legacy constraint error is present', () => {
        const resolved = getCompatFixtureMinLinesForInsert(150, null)
        expect(resolved).toBe(150)
    })

    it('falls back to legacy fixture minimum on old constraint error', () => {
        const resolved = getCompatFixtureMinLinesForInsert(
            150,
            'new row for relation "qa_runs" violates check constraint "qa_runs_fixture_min_lines_check"'
        )
        expect(resolved).toBe(LEGACY_QA_RUNS_FIXTURE_MIN_LINES)
    })

    it('does not lower values that are already above legacy minimum', () => {
        const resolved = getCompatFixtureMinLinesForInsert(
            240,
            'new row for relation "qa_runs" violates check constraint "qa_runs_fixture_min_lines_check"'
        )
        expect(resolved).toBe(240)
    })
})
