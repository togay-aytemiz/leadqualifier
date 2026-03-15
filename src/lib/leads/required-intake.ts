import { normalizeIntakeFields } from '@/lib/leads/offering-profile-utils'

const COMBINING_MARKS = /[\u0300-\u036f]/g

export interface RequiredIntakeOverrideMetaEntry {
  updated_at: string | null
  updated_by: string | null
  source?: 'manual'
}

export interface ResolvedRequiredIntakeItem {
  field: string
  value: string
  source: 'ai' | 'manual' | null
  updatedAt: string | null
  updatedBy: string | null
}

export function normalizeRequiredIntakeFieldKey(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
}

export function normalizeRequiredIntakeFieldValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized || null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
    return normalized.length > 0 ? normalized.join(', ') : null
  }
  return null
}

function normalizeCollectedMap(raw: unknown) {
  const map = new Map<string, string>()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return map

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = normalizeRequiredIntakeFieldKey(key)
    if (!normalizedKey) continue
    const normalizedValue = normalizeRequiredIntakeFieldValue(value)
    if (!normalizedValue) continue
    map.set(normalizedKey, normalizedValue)
  }

  return map
}

function normalizeOverrideMetaMap(raw: unknown) {
  const map = new Map<string, RequiredIntakeOverrideMetaEntry>()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return map

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = normalizeRequiredIntakeFieldKey(key)
    if (!normalizedKey || !value || typeof value !== 'object' || Array.isArray(value)) continue

    const record = value as Record<string, unknown>
    const updatedAt = typeof record.updated_at === 'string' ? record.updated_at : null
    const updatedBy = typeof record.updated_by === 'string' ? record.updated_by : null

    map.set(normalizedKey, {
      updated_at: updatedAt,
      updated_by: updatedBy,
      source: 'manual',
    })
  }

  return map
}

function inferFallbackValue(options: {
  field: string
  serviceType?: string | null
  extractedFields?: Record<string, unknown> | null
}) {
  const normalizedField = normalizeRequiredIntakeFieldKey(options.field)
  const extracted = options.extractedFields ?? {}
  const desiredDate = normalizeRequiredIntakeFieldValue(extracted.desired_date)
  const location = normalizeRequiredIntakeFieldValue(extracted.location)
  const budgetSignals = normalizeRequiredIntakeFieldValue(extracted.budget_signals)
  const serviceType = normalizeRequiredIntakeFieldValue(
    options.serviceType ?? extracted.service_type
  )

  const dateHints = ['tarih', 'date', 'gun', 'gün', 'zaman', 'time']
  const locationHints = [
    'konum',
    'lokasyon',
    'adres',
    'yer',
    'location',
    'sehir',
    'şehir',
    'ilce',
    'ilçe',
    'il',
  ]
  const budgetHints = ['butce', 'bütçe', 'ucret', 'ücret', 'fiyat', 'price', 'odeme', 'ödeme']
  const serviceHints = ['hizmet', 'service', 'cekim', 'çekim', 'paket']

  if (dateHints.some((hint) => normalizedField.includes(normalizeRequiredIntakeFieldKey(hint)))) {
    return desiredDate
  }
  if (
    locationHints.some((hint) => normalizedField.includes(normalizeRequiredIntakeFieldKey(hint)))
  ) {
    return location
  }
  if (budgetHints.some((hint) => normalizedField.includes(normalizeRequiredIntakeFieldKey(hint)))) {
    return budgetSignals
  }
  if (
    serviceHints.some((hint) => normalizedField.includes(normalizeRequiredIntakeFieldKey(hint)))
  ) {
    return serviceType
  }

  return null
}

export function resolveCollectedRequiredIntake(options: {
  requiredFields: string[]
  extractedFields?: Record<string, unknown> | null
  serviceType?: string | null
  includeEmpty?: boolean
}) {
  const requiredFields = normalizeIntakeFields(options.requiredFields ?? [])
  if (requiredFields.length === 0) return [] as ResolvedRequiredIntakeItem[]

  const collectedMap = normalizeCollectedMap(options.extractedFields?.required_intake_collected)
  const overrideMap = normalizeCollectedMap(
    options.extractedFields?.required_intake_overrides ??
      options.extractedFields?.manual_required_intake
  )
  const overrideMetaMap = normalizeOverrideMetaMap(
    options.extractedFields?.required_intake_override_meta
  )

  return requiredFields
    .map((field) => {
      const normalizedField = normalizeRequiredIntakeFieldKey(field)
      const overriddenValue = overrideMap.get(normalizedField)
      const explicitValue = collectedMap.get(normalizedField)
      const fallbackValue = inferFallbackValue({
        field,
        serviceType: options.serviceType,
        extractedFields: options.extractedFields,
      })
      const value = overriddenValue ?? explicitValue ?? fallbackValue
      if (!value && !options.includeEmpty) return null
      const source: ResolvedRequiredIntakeItem['source'] = value
        ? overriddenValue
          ? 'manual'
          : 'ai'
        : null
      const overrideMeta = overrideMetaMap.get(normalizedField)
      return {
        field,
        value: value ?? '',
        source,
        updatedAt: source === 'manual' ? (overrideMeta?.updated_at ?? null) : null,
        updatedBy: source === 'manual' ? (overrideMeta?.updated_by ?? null) : null,
      }
    })
    .filter((item): item is ResolvedRequiredIntakeItem => Boolean(item))
}
