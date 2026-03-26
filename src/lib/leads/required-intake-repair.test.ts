import { describe, expect, it } from 'vitest'

import { repairRequiredIntakeFromConversation } from '@/lib/leads/required-intake-repair'

describe('repairRequiredIntakeFromConversation', () => {
    it('backfills an exact required field label from a contextual ask and answer pair', () => {
        const repaired = repairRequiredIntakeFromConversation({
            requiredFields: ['Bebek Doğum Tarihi', 'Hamilelik Durumu'],
            existingCollected: {},
            recentAssistantMessages: ['Tahminen bebişin gelişi ne zaman'],
            recentCustomerMessages: ['Mayıs sonu haziran başı']
        })

        expect(repaired).toEqual({
            'Bebek Doğum Tarihi': 'Mayıs sonu haziran başı'
        })
    })

    it('does not auto-fill sibling status fields from a date-only contextual answer', () => {
        const repaired = repairRequiredIntakeFromConversation({
            requiredFields: ['Bebek Doğum Tarihi', 'Hamilelik Durumu'],
            existingCollected: {},
            recentAssistantMessages: ['Tahminen bebişin gelişi ne zaman'],
            recentCustomerMessages: ['Mayıs sonu haziran başı']
        })

        expect(repaired['Hamilelik Durumu']).toBeUndefined()
    })
})
