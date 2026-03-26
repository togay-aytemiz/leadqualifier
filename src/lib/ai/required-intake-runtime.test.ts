import { describe, expect, it } from 'vitest'

import { analyzeRuntimeRequiredIntake } from '@/lib/ai/required-intake-runtime'

describe('analyzeRuntimeRequiredIntake', () => {
    it('fulfills a direct timeline field from a contextual answer without field-label repetition', () => {
        const states = analyzeRuntimeRequiredIntake({
            requiredFields: ['Bebek Doğum Tarihi', 'Hamilelik Durumu'],
            recentAssistantMessages: ['Tahminen bebişin gelişi ne zaman'],
            recentCustomerMessages: ['Temmuz sonu ağustos başı gibi']
        })

        const babyBirthDate = states.find((state) => state.field === 'Bebek Doğum Tarihi')
        const pregnancyStatus = states.find((state) => state.field === 'Hamilelik Durumu')

        expect(babyBirthDate?.fulfilled).toBe(true)
        expect(babyBirthDate?.inferredValue).toBe('Temmuz sonu ağustos başı gibi')
        expect(pregnancyStatus?.fulfilled).toBe(false)
    })

    it('fulfills business size from a contextual answer without punctuation', () => {
        const states = analyzeRuntimeRequiredIntake({
            requiredFields: ['Ekip Büyüklüğü', 'Bütçe'],
            recentAssistantMessages: ['Ekibiniz kaç kişiden oluşuyor'],
            recentCustomerMessages: ['6 kişilik ekibiz']
        })

        const businessSize = states.find((state) => state.field === 'Ekip Büyüklüğü')
        expect(businessSize?.fulfilled).toBe(true)
        expect(businessSize?.inferredValue).toBe('6 kişilik ekibiz')
    })

    it('fulfills a binary status field from an explicit yes answer after a direct ask', () => {
        const states = analyzeRuntimeRequiredIntake({
            requiredFields: ['Hamilelik Durumu', 'Bebek Doğum Tarihi'],
            recentAssistantMessages: ['Şu an hamile misiniz?'],
            recentCustomerMessages: ['Evet']
        })

        const pregnancyStatus = states.find((state) => state.field === 'Hamilelik Durumu')
        const babyBirthDate = states.find((state) => state.field === 'Bebek Doğum Tarihi')

        expect(pregnancyStatus?.fulfilled).toBe(true)
        expect(pregnancyStatus?.inferredValue).toBe('Evet')
        expect(babyBirthDate?.fulfilled).toBe(false)
    })
})
