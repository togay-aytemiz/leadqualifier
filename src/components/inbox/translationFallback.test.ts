import { describe, expect, it } from 'vitest'

import { resolveTranslationValue } from './translationFallback'

describe('resolveTranslationValue', () => {
    it('returns the translated value when a real translation exists', () => {
        expect(
            resolveTranslationValue(
                'Mesajınıza {emoji} bıraktı',
                'Mesaj reaksiyonu',
                'inbox.'
            )
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
})
