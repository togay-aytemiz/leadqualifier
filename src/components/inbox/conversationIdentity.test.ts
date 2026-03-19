import { describe, expect, it } from 'vitest'

import { resolveConversationSecondaryIdentifier } from './conversationIdentity'

describe('resolveConversationSecondaryIdentifier', () => {
  it('hides instagram secondary contact ids in details surfaces', () => {
    expect(resolveConversationSecondaryIdentifier({
      platform: 'instagram',
      contact_phone: '937979745396825',
    }, 'No phone number')).toBeNull()
  })

  it('keeps whatsapp phone numbers visible', () => {
    expect(resolveConversationSecondaryIdentifier({
      platform: 'whatsapp',
      contact_phone: '+90 555 111 22 33',
    }, 'No phone number')).toBe('+90 555 111 22 33')
  })

  it('falls back to empty-state copy for non-instagram conversations without phone', () => {
    expect(resolveConversationSecondaryIdentifier({
      platform: 'telegram',
      contact_phone: '   ',
    }, 'No phone number')).toBe('No phone number')
  })
})
