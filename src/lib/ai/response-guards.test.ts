import { describe, expect, it } from 'vitest'

import {
    applyLiveAssistantResponseGuards,
    enforceResponseLanguageConsistency,
    sanitizeAssistantResponseSurfaceArtifacts
} from '@/lib/ai/response-guards'

describe('response guards', () => {
    it('normalizes mixed-language snippet for Turkish responses', () => {
        const normalized = enforceResponseLanguageConsistency({
            response: 'Maalesef burada doğrudan iptal işlemi yapamıyorum. We can continue here and clarify the best available options.',
            responseLanguage: 'tr'
        })

        expect(normalized).toContain('Maalesef burada doğrudan iptal işlemi yapamıyorum.')
        expect(normalized).toContain('Buradan devam ederek uygun seçenekleri netleştirebiliriz.')
        expect(normalized).not.toContain('We can continue here')
    })

    it('normalizes mixed-language snippet for English responses', () => {
        const normalized = enforceResponseLanguageConsistency({
            response: 'I cannot process cancellation directly. Buradan devam ederek uygun seçenekleri netleştirebiliriz.',
            responseLanguage: 'en'
        })

        expect(normalized).toContain('I cannot process cancellation directly.')
        expect(normalized).toContain('We can continue here and clarify the best available options.')
        expect(normalized).not.toContain('Buradan devam ederek uygun seçenekleri netleştirebiliriz.')
    })

    it('normalizes numeric and punctuation artifacts', () => {
        const sanitized = sanitizeAssistantResponseSurfaceArtifacts(
            'Bütçeniz 12. 000 TL. ( Örnek ).'
        )

        expect(sanitized).toBe('Bütçeniz 12.000 TL. (Örnek).')
    })

    it('strips repeated engagement questions when previous assistant turn already asked engagement', () => {
        const response = applyLiveAssistantResponseGuards({
            response: 'Elbette, detayları paylaştım. Başka bir konuda yardımcı olabilir miyim?',
            userMessage: 'Tamam, anladım.',
            responseLanguage: 'tr',
            recentAssistantMessages: ['Daha önce başka bir konuda yardımcı olabilir miyim?']
        })

        expect(response).toContain('Elbette, detayları paylaştım.')
        expect(response).not.toContain('Başka bir konuda yardımcı olabilir miyim?')
    })

    it('replaces external-contact redirect with chat-first continuation', () => {
        const response = applyLiveAssistantResponseGuards({
            response: 'Detaylar için web sitemizi ziyaret edin veya telefonla arayın.',
            userMessage: 'Fiyat bilgisi alabilir miyim?',
            responseLanguage: 'tr',
            recentAssistantMessages: []
        })

        expect(response).toContain('Buradan devam ederek uygun seçenekleri netleştirebiliriz.')
        expect(response.toLowerCase()).not.toContain('web sitemizi')
        expect(response.toLowerCase()).not.toContain('telefonla')
    })

    it('strips intake-like question after explicit refusal', () => {
        const response = applyLiveAssistantResponseGuards({
            response: 'Anladım. Bütçe aralığınızı paylaşabilir misiniz?',
            userMessage: 'Bunu paylaşmak istemiyorum.',
            responseLanguage: 'tr',
            recentAssistantMessages: []
        })

        expect(response).toBe('Anladım.')
    })

    it('strips blocked-field re-ask questions', () => {
        const response = applyLiveAssistantResponseGuards({
            response: 'Peki. Öğrenci yaşını paylaşabilir misiniz?',
            userMessage: 'Bu hafta 2-3 ders olabilir.',
            responseLanguage: 'tr',
            blockedReaskFields: ['Öğrenci Yaşı'],
            recentAssistantMessages: []
        })

        expect(response).toContain('Anladım.')
        expect(response).not.toContain('Öğrenci yaşını paylaşabilir misiniz')
    })

    it('strips intake questions when intake suppression is active', () => {
        const response = applyLiveAssistantResponseGuards({
            response: 'İptal politikasını paylaşayım. Bütçe aralığınızı da paylaşabilir misiniz?',
            userMessage: 'Randevumu iptal etmek istiyorum.',
            responseLanguage: 'tr',
            suppressIntakeQuestions: true,
            recentAssistantMessages: []
        })

        expect(response).toContain('İptal politikasını paylaşayım.')
        expect(response).not.toContain('Bütçe aralığınızı da paylaşabilir misiniz')
    })

    it('moves answer chunk before question on direct user question', () => {
        const response = applyLiveAssistantResponseGuards({
            response: 'Bütçe aralığınızı paylaşabilir misiniz? Fiyat, kapsam ve süreye göre netleşir.',
            userMessage: 'Fiyat nasıl belirleniyor?',
            responseLanguage: 'tr',
            recentAssistantMessages: []
        })

        expect(response.startsWith('Fiyat, kapsam ve süreye göre netleşir.')).toBe(true)
    })

    it('enforces no-progress loop break with concise summary and soft next step', () => {
        const response = applyLiveAssistantResponseGuards({
            response: 'Anladım. Bütçe aralığınızı paylaşabilir misiniz?',
            userMessage: 'Şimdilik bilmiyorum.',
            responseLanguage: 'tr',
            recentAssistantMessages: [],
            noProgressLoopBreak: true
        })

        expect(response).toContain('Anladım.')
        expect(response).toContain('Hazır olduğunuzda tek bir detay paylaşarak devam edebiliriz.')
        expect(response).not.toContain('Bütçe aralığınızı paylaşabilir misiniz')
    })

    it('does not force no-progress loop break when user asks a direct question', () => {
        const response = applyLiveAssistantResponseGuards({
            response: 'Fiyat proje kapsamına göre değişir. Yaklaşık bütçenizi paylaşır mısınız?',
            userMessage: 'Fiyat nasıl belirleniyor?',
            responseLanguage: 'tr',
            recentAssistantMessages: [],
            noProgressLoopBreak: true
        })

        expect(response.startsWith('Fiyat proje kapsamına göre değişir.')).toBe(true)
    })
})
