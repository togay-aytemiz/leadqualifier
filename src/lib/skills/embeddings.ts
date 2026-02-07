export function buildSkillEmbeddingTexts(title: string, triggerExamples: string[]): string[] {
    const candidates = [title, ...triggerExamples]
    const deduped = new Set<string>()

    for (const candidate of candidates) {
        const normalized = candidate.trim()
        if (!normalized) continue
        deduped.add(normalized)
    }

    return [...deduped]
}
