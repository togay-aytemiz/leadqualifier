const normalizeItem = (value: string) => value.trim()

export function parseOfferingProfileSummary(summary: string): string[] {
    return summary
        .split('\n')
        .map(normalizeItem)
        .filter(Boolean)
}

export function serializeOfferingProfileItems(items: string[]): string {
    return items.map(normalizeItem).filter(Boolean).join('\n')
}

export function mergeOfferingProfileItems(base: string[], incoming: string[]): string[] {
    const seen = new Set(base.map((item) => item.toLowerCase()))
    const next = [...base]
    for (const item of incoming) {
        const normalized = item.trim()
        if (!normalized) continue
        const key = normalized.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        next.push(normalized)
    }
    return next
}
