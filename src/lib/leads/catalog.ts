export function normalizeServiceName(value: string) {
    return value.trim().toLowerCase()
}

export function matchesCatalog(
    serviceType: string | null,
    catalog: Array<{ name: string; aliases?: string[] }>
) {
    if (!serviceType) return false
    const normalized = normalizeServiceName(serviceType)
    return catalog.some((item) => {
        if (normalizeServiceName(item.name) === normalized) return true
        const aliases = item.aliases ?? []
        return aliases.some((alias) => normalizeServiceName(alias) === normalized)
    })
}

export function isNewCandidate(name: string, existingNames: string[]) {
    const normalized = normalizeServiceName(name)
    return !existingNames.some((item) => normalizeServiceName(item) === normalized)
}
