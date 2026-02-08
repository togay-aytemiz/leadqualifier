export interface SummaryToggleResult {
    nextOpen: boolean
    shouldFetch: boolean
    resetCachedSummary: boolean
}

export function resolveSummaryToggle(isSummaryOpen: boolean): SummaryToggleResult {
    const nextOpen = !isSummaryOpen

    if (nextOpen) {
        return {
            nextOpen: true,
            shouldFetch: true,
            resetCachedSummary: false
        }
    }

    return {
        nextOpen: false,
        shouldFetch: false,
        resetCachedSummary: true
    }
}
