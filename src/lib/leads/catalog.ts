export function normalizeServiceName(value: string) {
    return value.trim().toLowerCase()
}

export function isNewCandidate(name: string, existingNames: string[]) {
    const normalized = normalizeServiceName(name)
    return !existingNames.some((item) => normalizeServiceName(item) === normalized)
}
