function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function splitBotMessageDisclaimer(content: string) {
    const match = content.match(/^([\s\S]*)\n\n>\s*([^\r\n]+)\s*$/)
    if (!match) {
        return {
            body: content,
            disclaimer: null as string | null
        }
    }

    const body = match[1]?.trimEnd() ?? ''
    const disclaimer = match[2]?.trim()

    if (!body || !disclaimer) {
        return {
            body: content,
            disclaimer: null as string | null
        }
    }

    return {
        body,
        disclaimer
    }
}

export function extractSkillTitleFromMetadata(metadata: unknown) {
    if (!isRecord(metadata)) return null
    const raw = metadata.skill_title
    if (typeof raw !== 'string') return null
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : null
}
