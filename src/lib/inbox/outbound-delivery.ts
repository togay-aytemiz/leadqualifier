import type { Json } from '@/types/database'

export type OutboundDeliveryStatus = 'pending' | 'sent' | 'failed'

export interface OutboundDeliveryMetadata {
  outbound_delivery_status?: OutboundDeliveryStatus
  outbound_channel?: 'whatsapp' | 'instagram' | 'telegram'
  outbound_provider_message_id?: string | null
  outbound_error_code?: string | null
  whatsapp_outbound_status?: 'sending' | 'failed'
  instagram_outbound_status?: 'sending' | 'failed'
  whatsapp_outbound_attachment_id?: string | null
  instagram_outbound_attachment_id?: string | null
}

export function buildOutboundDeliveryMetadata(
  base: Json | undefined,
  updates: Partial<OutboundDeliveryMetadata>
): Json {
  const normalizedBase = typeof base === 'object' && base !== null ? { ...base } : {}
  const merged: OutboundDeliveryMetadata = {
    ...(normalizedBase as OutboundDeliveryMetadata),
    ...updates,
  }
  const sanitized = Object.fromEntries(
    Object.entries(merged).filter(([, value]) => value !== undefined)
  )

  return sanitized as Json
}

export function parseOutboundDeliveryStatus(metadata: unknown): OutboundDeliveryStatus | null {
  if (typeof metadata !== 'object' || metadata === null) return null
  const value = (metadata as OutboundDeliveryMetadata).outbound_delivery_status
  if (value === 'pending' || value === 'sent' || value === 'failed') {
    return value
  }
  if ((metadata as OutboundDeliveryMetadata).whatsapp_outbound_status === 'failed') return 'failed'
  if ((metadata as OutboundDeliveryMetadata).instagram_outbound_status === 'failed') return 'failed'
  if ((metadata as OutboundDeliveryMetadata).whatsapp_outbound_status === 'sending') return 'pending'
  if ((metadata as OutboundDeliveryMetadata).instagram_outbound_status === 'sending') return 'pending'
  return null
}
