export function resolveTranslationValue(
    value: string,
    fallback: string,
    namespacePrefix: string
) {
    if (!value.trim()) return fallback
    return value.startsWith(namespacePrefix) ? fallback : value
}
