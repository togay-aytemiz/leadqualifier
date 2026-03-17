import { describe, expect, it } from 'vitest'
import { buildOutboundDeliveryMetadata, parseOutboundDeliveryStatus } from '@/lib/inbox/outbound-delivery'

describe('Outbound delivery metadata helper', () => {
  it('merges metadata without losing existing keys', () => {
    const base = {
      note: 'existing',
      outbound_channel: 'whatsapp',
    }
    const result = buildOutboundDeliveryMetadata(base, {
      outbound_delivery_status: 'pending',
      outbound_provider_message_id: 'wamid.1',
    })

    expect(result).toEqual({
      note: 'existing',
      outbound_channel: 'whatsapp',
      outbound_delivery_status: 'pending',
      outbound_provider_message_id: 'wamid.1',
    })
  })

  it('omits undefined fields so metadata stays valid JSON', () => {
    const result = buildOutboundDeliveryMetadata(
      {
        note: 'existing',
        outbound_channel: 'whatsapp',
      },
      {
        outbound_delivery_status: 'pending',
        outbound_provider_message_id: undefined,
      }
    ) as Record<string, unknown>

    expect(result).toEqual({
      note: 'existing',
      outbound_channel: 'whatsapp',
      outbound_delivery_status: 'pending',
    })
    expect(result).not.toHaveProperty('outbound_provider_message_id')
  })

  it('parses explicit outbound_delivery_status values', () => {
    expect(
      parseOutboundDeliveryStatus({
        outbound_delivery_status: 'sent',
      })
    ).toBe('sent')
    expect(
      parseOutboundDeliveryStatus({
        outbound_delivery_status: 'failed',
      })
    ).toBe('failed')
  })

  it('falls back to legacy provider keys when status missing', () => {
    expect(
      parseOutboundDeliveryStatus({
        whatsapp_outbound_status: 'sending',
      })
    ).toBe('pending')
    expect(
      parseOutboundDeliveryStatus({
        instagram_outbound_status: 'sending',
      })
    ).toBe('pending')
    expect(
      parseOutboundDeliveryStatus({
        whatsapp_outbound_status: 'failed',
      })
    ).toBe('failed')
    expect(
      parseOutboundDeliveryStatus({
        instagram_outbound_status: 'failed',
      })
    ).toBe('failed')
  })

  it('returns null when no recognizable metadata is present', () => {
    expect(parseOutboundDeliveryStatus({ foo: 'bar' })).toBeNull()
    expect(parseOutboundDeliveryStatus(undefined)).toBeNull()
  })
})
