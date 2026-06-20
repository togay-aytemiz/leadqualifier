import { describe, expect, it } from 'vitest'

import { excludeRowsByPoolId, readExcludedPoolIds } from './yiu-eval-selection'

describe('readExcludedPoolIds', () => {
    it('collects unique ids from selected rows and completed results', () => {
        expect([...readExcludedPoolIds({
            selected: [{ no: 4 }, { no: 8 }],
            results: [{ poolId: 8 }, { poolId: 15 }, { poolId: 'bad' }]
        })].sort((left, right) => left - right)).toEqual([4, 8, 15])
    })
})

describe('excludeRowsByPoolId', () => {
    it('removes every previously selected pool id without changing the remaining order', () => {
        const rows = [
            { no: 1, question: 'bir', originalScore: 1 },
            { no: 2, question: 'iki', originalScore: 2 },
            { no: 3, question: 'üç', originalScore: 3 }
        ]

        expect(excludeRowsByPoolId(rows, new Set([1, 3]))).toEqual([rows[1]])
    })
})
