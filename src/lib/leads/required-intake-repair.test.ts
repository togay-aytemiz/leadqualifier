import { describe, expect, it } from 'vitest'

import { repairRequiredIntakeFromConversation } from '@/lib/leads/required-intake-repair'

describe('repairRequiredIntakeFromConversation', () => {
    it('backfills a contextual timeline field without touching unrelated status fields', () => {
        const repaired = repairRequiredIntakeFromConversation({
            requiredFields: ['İstenen Tarih', 'Üyelik Durumu'],
            existingCollected: {},
            recentAssistantMessages: ['Sizin için hangi tarih daha uygun?'],
            recentCustomerMessages: ['Mayıs sonu haziran başı']
        })

        expect(repaired).toEqual({
            'İstenen Tarih': 'Mayıs sonu haziran başı'
        })
    })

    it('does not auto-fill unrelated sibling status fields from a date-only contextual answer', () => {
        const repaired = repairRequiredIntakeFromConversation({
            requiredFields: ['İstenen Tarih', 'Üyelik Durumu'],
            existingCollected: {},
            recentAssistantMessages: ['Sizin için hangi tarih daha uygun?'],
            recentCustomerMessages: ['Mayıs sonu haziran başı']
        })

        expect(repaired['Üyelik Durumu']).toBeUndefined()
    })

    it('replaces an incompatible boolean value with an affirmative inference when sibling evidence is stronger', () => {
        const repaired = repairRequiredIntakeFromConversation({
            requiredFields: ['Bebek Doğum Tarihi', 'Hamilelik Durumu'],
            existingCollected: {
                'Hamilelik Durumu': 'Ağustos ayı gibi inşaAllah'
            },
            recentAssistantMessages: ['Tahminen bebişin gelişi ne zaman'],
            recentCustomerMessages: ['Ağustos ayı gibi inşaAllah']
        })

        expect(repaired).toEqual({
            'Bebek Doğum Tarihi': 'Ağustos ayı gibi inşaAllah',
            'Hamilelik Durumu': 'Evet'
        })
    })

    it('infers an affirmative status from a concrete sibling due-date answer', () => {
        const repaired = repairRequiredIntakeFromConversation({
            requiredFields: ['Bebek Doğum Tarihi', 'Hamilelik Durumu'],
            existingCollected: {},
            recentAssistantMessages: ['Tahminen bebişin gelişi ne zaman'],
            recentCustomerMessages: ['20 Temmuzda bekliyoruz inşallah']
        })

        expect(repaired).toEqual({
            'Bebek Doğum Tarihi': '20 Temmuzda bekliyoruz inşallah',
            'Hamilelik Durumu': 'Evet'
        })
    })
})
