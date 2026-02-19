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

function normalizeServiceCatalogLabel(value: string) {
    return value.trim().replace(/\s+/g, ' ')
}

function normalizeServiceCatalogKey(value: string) {
    return normalizeServiceCatalogLabel(value)
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

export function normalizeServiceCatalogNames(input: string[]) {
    const deduped: string[] = []
    const seen = new Set<string>()

    for (const item of input) {
        const label = normalizeServiceCatalogLabel(item)
        if (!label) continue
        const key = normalizeServiceCatalogKey(label)
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

function stripJsonFence(value: string) {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    return fenced?.[1]?.trim() ?? value
}

function extractFencedBlocks(value: string) {
    const blocks: string[] = []
    const pattern = /```(?:json)?\s*([\s\S]*?)\s*```/gi
    let match: RegExpExecArray | null = pattern.exec(value)
    while (match) {
        const captured = match[1]?.trim()
        if (captured) blocks.push(captured)
        match = pattern.exec(value)
    }
    return blocks
}

function extractFirstBalanced(value: string, open: '{' | '[', close: '}' | ']') {
    const text = value.trim()
    if (!text) return null
    if (text.startsWith(open) && text.endsWith(close)) return text

    let startIndex = -1
    let depth = 0

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i]
        if (char === open) {
            if (depth === 0) startIndex = i
            depth += 1
            continue
        }
        if (char === close && depth > 0) {
            depth -= 1
            if (depth === 0 && startIndex !== -1) {
                return text.slice(startIndex, i + 1)
            }
        }
    }

    return null
}

function parseJsonCandidate(input: string) {
    try {
        return JSON.parse(input)
    } catch {
        return null
    }
}

export function parseRequiredIntakeFieldsPayload(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return null

    const stripped = stripJsonFence(trimmed)
    const candidates = [
        trimmed,
        stripped,
        ...extractFencedBlocks(trimmed),
        extractFirstBalanced(stripped, '{', '}'),
        extractFirstBalanced(stripped, '[', ']')
    ].filter((item): item is string => Boolean(item))

    const seen = new Set<string>()

    for (const candidate of candidates) {
        if (seen.has(candidate)) continue
        seen.add(candidate)

        const parsed = parseJsonCandidate(candidate)
        if (!parsed) continue

        if (Array.isArray(parsed)) {
            return normalizeIntakeFields(parsed.filter((item): item is string => typeof item === 'string'))
        }

        if (typeof parsed !== 'object') continue

        const parsedObject = parsed as Record<string, unknown>
        const fields = parsedObject.required_fields ?? parsedObject.requiredFields

        if (Array.isArray(fields)) {
            return normalizeIntakeFields(fields.filter((item): item is string => typeof item === 'string'))
        }

        if (typeof fields === 'string') {
            return normalizeIntakeFields([fields])
        }
    }

    return null
}

export function parseServiceCandidatesPayload(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return null

    const stripped = stripJsonFence(trimmed)
    const candidates = [
        trimmed,
        stripped,
        ...extractFencedBlocks(trimmed),
        extractFirstBalanced(stripped, '{', '}'),
        extractFirstBalanced(stripped, '[', ']')
    ].filter((item): item is string => Boolean(item))

    const seen = new Set<string>()

    for (const candidate of candidates) {
        if (seen.has(candidate)) continue
        seen.add(candidate)

        const parsed = parseJsonCandidate(candidate)
        if (!parsed) continue

        if (Array.isArray(parsed)) {
            return normalizeServiceCatalogNames(
                parsed.filter((item): item is string => typeof item === 'string')
            )
        }

        if (typeof parsed !== 'object') continue

        const parsedObject = parsed as Record<string, unknown>
        const services = parsedObject.services
            ?? parsedObject.service_names
            ?? parsedObject.serviceNames
            ?? parsedObject.service_catalog
            ?? parsedObject.serviceCatalog

        if (Array.isArray(services)) {
            return normalizeServiceCatalogNames(
                services.filter((item): item is string => typeof item === 'string')
            )
        }

        if (typeof services === 'string') {
            return normalizeServiceCatalogNames([services])
        }
    }

    return null
}
