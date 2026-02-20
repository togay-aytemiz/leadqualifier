export type QaLabPreset = 'quick' | 'regression'

export interface QaLabFixtureStyleMix {
    clean: number
    semiNoisy: number
    messy: number
}

export interface QaLabPresetConfig {
    id: QaLabPreset
    scenarioCount: number
    maxTurnsPerScenario: number
    maxTokenBudget: number
    fixtureMinLines: number
    fixtureStyleMix: QaLabFixtureStyleMix
}

const QA_LAB_PRESET_MAP: Record<QaLabPreset, QaLabPresetConfig> = {
    quick: {
        id: 'quick',
        scenarioCount: 20,
        maxTurnsPerScenario: 6,
        maxTokenBudget: 100_000,
        fixtureMinLines: 150,
        fixtureStyleMix: {
            clean: 0.2,
            semiNoisy: 0.5,
            messy: 0.3
        }
    },
    regression: {
        id: 'regression',
        scenarioCount: 36,
        maxTurnsPerScenario: 6,
        maxTokenBudget: 100_000,
        fixtureMinLines: 150,
        fixtureStyleMix: {
            clean: 0.1,
            semiNoisy: 0.4,
            messy: 0.5
        }
    }
}

export const QA_LAB_PRESETS: QaLabPresetConfig[] = Object.values(QA_LAB_PRESET_MAP).map((preset) => ({
    ...preset,
    fixtureStyleMix: { ...preset.fixtureStyleMix }
}))

export function isQaLabPreset(value: string): value is QaLabPreset {
    return value === 'quick' || value === 'regression'
}

export function getQaLabPresetConfig(preset: QaLabPreset): QaLabPresetConfig {
    const selected = QA_LAB_PRESET_MAP[preset]
    return {
        ...selected,
        fixtureStyleMix: { ...selected.fixtureStyleMix }
    }
}
