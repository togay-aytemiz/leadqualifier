function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function splitBotMessageDisclaimer(content: string) {
    const normalized = content.replace(/\r\n/g, '\n')
    const markerMatch = normalized.match(/\n\s*>\s*([^\n]+)\s*$/)
    const markerIndex = markerMatch?.index ?? -1
    const disclaimerLine = markerMatch?.[1]?.trim() ?? ''
    if (markerIndex <= 0 || !disclaimerLine) {
        return {
            body: content,
            disclaimer: null as string | null
        }
    }

    const body = normalized.slice(0, markerIndex).trimEnd()

    if (!body) {
        return {
            body: content,
            disclaimer: null as string | null
        }
    }

    return {
        body,
        disclaimer: disclaimerLine
    }
}

export function extractSkillTitleFromMetadata(metadata: unknown) {
    let normalizedMetadata = metadata
    if (typeof normalizedMetadata === 'string') {
        const trimmed = normalizedMetadata.trim()
        if (!trimmed) return null
        try {
            normalizedMetadata = JSON.parse(trimmed)
        } catch {
            return null
        }
    }

    if (!isRecord(normalizedMetadata)) return null

    const candidates: unknown[] = [
        normalizedMetadata.skill_title,
        normalizedMetadata.skillTitle,
        normalizedMetadata.matched_skill_title,
        normalizedMetadata.skill_name
    ]

    const nestedSkill = normalizedMetadata.skill
    if (isRecord(nestedSkill)) {
        candidates.push(nestedSkill.title)
        candidates.push(nestedSkill.name)
    }

    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue
        const trimmed = candidate.trim()
        if (trimmed.length > 0) return trimmed
    }

    return null
}
