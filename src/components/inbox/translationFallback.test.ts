import { describe, expect, it, vi } from 'vitest'

import { resolveTranslationTemplate, resolveTranslationValue } from './translationFallback'

describe('resolveTranslationValue', () => {
  it('returns the translated value when a real translation exists', () => {
    expect(
      resolveTranslationValue('Mesajınıza {emoji} bıraktı', 'Mesaj reaksiyonu', 'inbox.')
    ).toBe('Mesajınıza {emoji} bıraktı')
  })

  it('falls back when next-intl returns the raw namespace key', () => {
    expect(
      resolveTranslationValue(
        'inbox.instagramReaction.reacted',
        '{emoji} ile tepki verdi',
        'inbox.'
      )
    ).toBe('{emoji} ile tepki verdi')
  })

  it('reads ICU template strings via raw without formatting them', () => {
    const reader = {
      has: vi.fn(() => true),
      raw: vi.fn(() => 'Mesajınıza {emoji} bıraktı'),
    }

    expect(
      resolveTranslationTemplate(
        reader,
        'instagramReaction.reactedToYourMessage',
        'Mesaj reaksiyonu',
        'inbox.'
      )
    ).toBe('Mesajınıza {emoji} bıraktı')

    expect(reader.has).toHaveBeenCalledWith('instagramReaction.reactedToYourMessage')
    expect(reader.raw).toHaveBeenCalledWith('instagramReaction.reactedToYourMessage')
  })

  it('returns the fallback when the translation key does not exist', () => {
    const reader = {
      has: vi.fn(() => false),
      raw: vi.fn(),
    }

    expect(
      resolveTranslationTemplate(
        reader,
        'instagramReaction.reacted',
        '{emoji} ile tepki verdi',
        'inbox.'
      )
    ).toBe('{emoji} ile tepki verdi')

    expect(reader.raw).not.toHaveBeenCalled()
  })
})
