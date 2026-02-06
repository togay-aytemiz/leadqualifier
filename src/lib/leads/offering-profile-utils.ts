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

const COMBINING_MARKS = /[\u0300-\u036f]/g

function normalizeIntakeFieldLabel(value: string) {
    return value.trim().replace(/\s+/g, ' ')
}

function normalizeIntakeFieldKey(value: string) {
    return normalizeIntakeFieldLabel(value)
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')
        .toLowerCase()
}

export function normalizeIntakeFields(input: string[]) {
    const deduped: string[] = []
    const seen = new Set<string>()

    for (const item of input) {
        const label = normalizeIntakeFieldLabel(item)
        if (!label) continue
        const key = normalizeIntakeFieldKey(label)
        if (!key || seen.has(key)) continue
        seen.add(key)
        deduped.push(label)
    }

    return deduped
}

export function filterMissingIntakeFields(existing: string[], proposed: string[]) {
    const existingKeys = new Set(
        normalizeIntakeFields(existing).map((item) => normalizeIntakeFieldKey(item))
    )

    return normalizeIntakeFields(proposed).filter((item) => {
        const key = normalizeIntakeFieldKey(item)
        return key.length > 0 && !existingKeys.has(key)
    })
}

export function mergeIntakeFields(current: string[], proposed: string[]) {
    return normalizeIntakeFields([...current, ...proposed])
}

export function parseRequiredIntakeFieldsPayload(raw: string) {
    try {
        const parsed = JSON.parse(raw)

        if (Array.isArray(parsed)) {
            return normalizeIntakeFields(parsed.filter((item): item is string => typeof item === 'string'))
        }

        if (!parsed || typeof parsed !== 'object') return null

        const candidates = (parsed as any).required_fields ?? (parsed as any).requiredFields
        if (Array.isArray(candidates)) {
            return normalizeIntakeFields(candidates.filter((item): item is string => typeof item === 'string'))
        }

        if (typeof candidates === 'string') {
            return normalizeIntakeFields([candidates])
        }

        return null
    } catch {
        return null
    }
}
