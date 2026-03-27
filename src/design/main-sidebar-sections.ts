export const MAIN_SIDEBAR_SECTIONS_STORAGE_KEY = 'leadqualifier.mainSidebarSections'

export type MainSidebarSectionState = Record<string, boolean>

interface HydrateMainSidebarSectionStateOptions {
    sectionIds: readonly string[]
    storedValue: string | null
}

interface SyncMainSidebarSectionStateOptions {
    sectionIds: readonly string[]
    currentState: MainSidebarSectionState
}

function buildDefaultSectionState(sectionIds: readonly string[]): MainSidebarSectionState {
    return Object.fromEntries(sectionIds.map((sectionId) => [sectionId, true]))
}

function parseStoredSectionState(storedValue: string | null): MainSidebarSectionState {
    if (!storedValue) return {}

    try {
        const parsed = JSON.parse(storedValue) as unknown
        if (typeof parsed !== 'object' || parsed === null) {
            return {}
        }

        return Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
        )
    } catch {
        return {}
    }
}

export function hydrateMainSidebarSectionState({
    sectionIds,
    storedValue
}: HydrateMainSidebarSectionStateOptions): MainSidebarSectionState {
    const defaults = buildDefaultSectionState(sectionIds)
    const storedState = parseStoredSectionState(storedValue)

    for (const sectionId of sectionIds) {
        const persistedValue = storedState[sectionId]
        if (typeof persistedValue === 'boolean') {
            defaults[sectionId] = persistedValue
        }
    }

    return defaults
}

export function syncMainSidebarSectionState({
    sectionIds,
    currentState
}: SyncMainSidebarSectionStateOptions): MainSidebarSectionState {
    const nextState = buildDefaultSectionState(sectionIds)

    for (const sectionId of sectionIds) {
        const currentValue = currentState[sectionId]
        if (typeof currentValue === 'boolean') {
            nextState[sectionId] = currentValue
        }
    }

    return nextState
}

export function toggleMainSidebarSection(
    currentState: MainSidebarSectionState,
    sectionId: string
): MainSidebarSectionState {
    if (!(sectionId in currentState)) {
        return currentState
    }

    return {
        ...currentState,
        [sectionId]: !currentState[sectionId]
    }
}
