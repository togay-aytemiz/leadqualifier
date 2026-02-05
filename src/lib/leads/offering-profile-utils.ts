export function parseSuggestionPayload(raw: string) {
    try {
        const parsed = JSON.parse(raw)
        const suggestion = (parsed.suggestion ?? '').toString().trim()
        if (!suggestion) return null
        const indexValue = parsed.update_index ?? parsed.updateIndex
        const updateIndex = Number.isFinite(Number(indexValue)) && Number(indexValue) > 0
            ? Math.floor(Number(indexValue))
            : null
        return { suggestion, updateIndex }
    } catch {
        return null
    }
}
