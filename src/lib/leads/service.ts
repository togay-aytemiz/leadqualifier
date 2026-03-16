import { normalizeServiceName } from '@/lib/leads/catalog'
import { normalizeServiceCatalogNames } from '@/lib/leads/offering-profile-utils'
import type { RequiredIntakeOverrideMetaEntry } from '@/lib/leads/required-intake'

interface LeadServiceSnapshotLike {
  service_type?: string | null
  extracted_fields?: unknown
}

export interface ResolvedLeadService {
  value: string | null
  source: 'manual' | 'ai' | null
  overrideMeta: RequiredIntakeOverrideMetaEntry | null
}

function asExtractedFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function normalizeServiceValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function normalizeServiceOverrideMeta(value: unknown): RequiredIntakeOverrideMetaEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  return {
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : null,
    updated_by: typeof record.updated_by === 'string' ? record.updated_by : null,
    source: 'manual',
  }
}

function getExtractedServiceNames(extractedFields: Record<string, unknown>) {
  const rawServices = Array.isArray(extractedFields.services) ? extractedFields.services : []
  return normalizeServiceCatalogNames(
    rawServices
      .map((service) => normalizeServiceValue(service))
      .filter((service): service is string => Boolean(service))
  )
}

export function resolveLeadService(snapshot: LeadServiceSnapshotLike): ResolvedLeadService {
  const extractedFields = asExtractedFields(snapshot.extracted_fields)
  const overrideValue = normalizeServiceValue(extractedFields.service_override)
  const serviceType = normalizeServiceValue(snapshot.service_type)
  const extractedServices = getExtractedServiceNames(extractedFields)
  const aiValue = serviceType ?? extractedServices[0] ?? null

  if (overrideValue) {
    return {
      value: overrideValue,
      source: 'manual',
      overrideMeta: normalizeServiceOverrideMeta(extractedFields.service_override_meta),
    }
  }

  return {
    value: aiValue,
    source: aiValue ? 'ai' : null,
    overrideMeta: null,
  }
}

export function resolveLeadServiceNames(snapshot: LeadServiceSnapshotLike): string[] {
  const extractedFields = asExtractedFields(snapshot.extracted_fields)
  const overrideValue = normalizeServiceValue(extractedFields.service_override)
  if (overrideValue) {
    return [overrideValue]
  }

  const serviceType = normalizeServiceValue(snapshot.service_type)
  const extractedServices = getExtractedServiceNames(extractedFields)
  const combined = serviceType ? [serviceType, ...extractedServices] : extractedServices
  const dedupedServices: string[] = []
  const seen = new Set<string>()

  for (const service of combined) {
    const normalizedKey = normalizeServiceName(service)
    if (seen.has(normalizedKey)) continue
    seen.add(normalizedKey)
    dedupedServices.push(service)
  }

  return dedupedServices
}
