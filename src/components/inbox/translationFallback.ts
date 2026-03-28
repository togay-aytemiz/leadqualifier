export function resolveTranslationValue(value: string, fallback: string, namespacePrefix: string) {
  if (!value.trim()) return fallback
  return value.startsWith(namespacePrefix) ? fallback : value
}

type TranslationTemplateReader = {
  has: (key: string) => boolean
  raw: (key: string) => unknown
}

export function resolveTranslationTemplate(
  reader: TranslationTemplateReader,
  key: string,
  fallback: string,
  namespacePrefix: string
) {
  if (!reader.has(key)) return fallback

  const rawValue = reader.raw(key)

  return resolveTranslationValue(
    typeof rawValue === 'string' ? rawValue : '',
    fallback,
    namespacePrefix
  )
}
