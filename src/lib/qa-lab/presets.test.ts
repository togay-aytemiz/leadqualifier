import { describe, expect, it } from 'vitest'

import {
    getQaLabPresetConfig,
    isQaLabPreset,
    QA_LAB_PRESETS
} from '@/lib/qa-lab/presets'

describe('qa lab presets', () => {
    it('resolves quick preset limits and fixture rules', () => {
        const quick = getQaLabPresetConfig('quick')

        expect(quick.id).toBe('quick')
        expect(quick.scenarioCount).toBe(15)
        expect(quick.maxTurnsPerScenario).toBe(6)
        expect(quick.maxTokenBudget).toBe(100_000)
        expect(quick.fixtureMinLines).toBe(150)
        expect(quick.fixtureStyleMix.clean).toBeCloseTo(0.2)
        expect(quick.fixtureStyleMix.semiNoisy).toBeCloseTo(0.5)
        expect(quick.fixtureStyleMix.messy).toBeCloseTo(0.3)
    })

    it('resolves regression preset limits and fixture rules', () => {
        const regression = getQaLabPresetConfig('regression')

        expect(regression.id).toBe('regression')
        expect(regression.scenarioCount).toBe(15)
        expect(regression.maxTurnsPerScenario).toBe(6)
        expect(regression.maxTokenBudget).toBe(100_000)
        expect(regression.fixtureMinLines).toBe(150)
        expect(regression.fixtureStyleMix.clean).toBeCloseTo(0.1)
        expect(regression.fixtureStyleMix.semiNoisy).toBeCloseTo(0.4)
        expect(regression.fixtureStyleMix.messy).toBeCloseTo(0.5)
    })

    it('keeps fixture mix ratios normalized for all presets', () => {
        for (const preset of QA_LAB_PRESETS) {
            const mix = preset.fixtureStyleMix
            const total = mix.clean + mix.semiNoisy + mix.messy

            expect(total).toBeCloseTo(1)
            expect(mix.clean).toBeGreaterThanOrEqual(0)
            expect(mix.semiNoisy).toBeGreaterThanOrEqual(0)
            expect(mix.messy).toBeGreaterThanOrEqual(0)
        }
    })

    it('validates preset identity guards', () => {
        expect(isQaLabPreset('quick')).toBe(true)
        expect(isQaLabPreset('regression')).toBe(true)
        expect(isQaLabPreset('legacy')).toBe(false)
        expect(isQaLabPreset('')).toBe(false)
    })
})
