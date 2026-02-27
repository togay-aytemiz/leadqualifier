import { describe, expect, it } from 'vitest'
import {
    isMvpResponseLanguageAmbiguous,
    isLikelyTurkishMessage,
    resolveMvpResponseLanguage,
    resolveMvpResponseLanguageName
} from '@/lib/ai/language'

describe('ai language helpers', () => {
    it('detects Turkish from characters and keywords', () => {
        expect(isLikelyTurkishMessage('Yenidoğan çekimi için fiyat nedir?')).toBe(true)
        expect(isLikelyTurkishMessage('Randevu almak istiyorum')).toBe(true)
        expect(isLikelyTurkishMessage('Sadece iptal edin yeter.')).toBe(true)
        expect(resolveMvpResponseLanguage('Detay vermeden once genel yaklasimi ozetleyebilir misiniz?')).toBe('tr')
    })

    it('defaults to English when message is not Turkish', () => {
        expect(isLikelyTurkishMessage('I want to book a newborn photoshoot')).toBe(false)
        expect(isLikelyTurkishMessage('Please cancel my appointment')).toBe(false)
        expect(resolveMvpResponseLanguage('I want to book a newborn photoshoot')).toBe('en')
        expect(resolveMvpResponseLanguageName('I want to book a newborn photoshoot')).toBe('English')
    })

    it('resolves Turkish labels correctly', () => {
        expect(resolveMvpResponseLanguage('Merhaba')).toBe('tr')
        expect(resolveMvpResponseLanguageName('Merhaba')).toBe('Turkish')
    })

    it('treats ascii Turkish complaint phrases as Turkish', () => {
        expect(isLikelyTurkishMessage('Sikayetim var')).toBe(true)
        expect(resolveMvpResponseLanguage('Sikayetim var')).toBe('tr')
        expect(resolveMvpResponseLanguageName('Sikayetim var')).toBe('Turkish')
    })

    it('uses history when current message language is ambiguous', () => {
        expect(isMvpResponseLanguageAmbiguous('ok')).toBe(true)
        expect(resolveMvpResponseLanguage('ok', {
            historyMessages: [
                'Merhaba, detay alabilir miyim?',
                'fiyat bilgisi paylaşır mısınız?'
            ]
        })).toBe('tr')
        expect(resolveMvpResponseLanguageName('ok', {
            historyMessages: ['Merhaba, detay alabilir miyim?']
        })).toBe('Turkish')
    })

    it('keeps decisive current language over opposite history', () => {
        expect(resolveMvpResponseLanguage('Please share availability', {
            historyMessages: ['Merhaba, fiyat nedir?']
        })).toBe('en')
        expect(resolveMvpResponseLanguageName('Please share availability', {
            historyMessages: ['Merhaba, fiyat nedir?']
        })).toBe('English')
    })
})
