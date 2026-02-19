import { describe, expect, it } from 'vitest'
import {
    isLikelyTurkishMessage,
    resolveMvpResponseLanguage,
    resolveMvpResponseLanguageName
} from '@/lib/ai/language'

describe('ai language helpers', () => {
    it('detects Turkish from characters and keywords', () => {
        expect(isLikelyTurkishMessage('Yenidoğan çekimi için fiyat nedir?')).toBe(true)
        expect(isLikelyTurkishMessage('Randevu almak istiyorum')).toBe(true)
    })

    it('defaults to English when message is not Turkish', () => {
        expect(isLikelyTurkishMessage('I want to book a newborn photoshoot')).toBe(false)
        expect(resolveMvpResponseLanguage('I want to book a newborn photoshoot')).toBe('en')
        expect(resolveMvpResponseLanguageName('I want to book a newborn photoshoot')).toBe('English')
    })

    it('resolves Turkish labels correctly', () => {
        expect(resolveMvpResponseLanguage('Merhaba')).toBe('tr')
        expect(resolveMvpResponseLanguageName('Merhaba')).toBe('Turkish')
    })
})

