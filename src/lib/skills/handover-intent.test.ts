import { describe, expect, it } from 'vitest'
import { shouldUseSkillMatchForMessage } from './handover-intent'

describe('shouldUseSkillMatchForMessage', () => {
    it('accepts non-handover matches without extra intent checks', () => {
        const accepted = shouldUseSkillMatchForMessage({
            userMessage: 'hizmetleriniz hakkında bilgi almak istiyorum',
            requiresHumanHandover: false,
            match: {
                skill_id: 'skill-1',
                title: 'Bilgi',
                response_text: '...',
                trigger_text: 'hizmet bilgisi',
                similarity: 0.63
            }
        })

        expect(accepted).toBe(true)
    })

    it('accepts handover matches when user has explicit handover/complaint intent', () => {
        const accepted = shouldUseSkillMatchForMessage({
            userMessage: 'şikayetim var, lütfen beni bir temsilciye bağlayın',
            requiresHumanHandover: true,
            match: {
                skill_id: 'skill-2',
                title: 'Şikayet ve Memnuniyetsizlik',
                response_text: '...',
                trigger_text: 'Şikayetim var',
                similarity: 0.64
            }
        })

        expect(accepted).toBe(true)
    })

    it('rejects false-positive handover matches for neutral service-intent messages', () => {
        const accepted = shouldUseSkillMatchForMessage({
            userMessage: 'hizmetleriniz hakkında bilgi almak istiyorum',
            requiresHumanHandover: true,
            match: {
                skill_id: 'skill-3',
                title: 'Şikayet ve Memnuniyetsizlik',
                response_text: '...',
                trigger_text: 'Bu konuda destek istiyorum',
                similarity: 0.72
            }
        })

        expect(accepted).toBe(false)
    })

    it('accepts handover match when lexical overlap with trigger is strong', () => {
        const accepted = shouldUseSkillMatchForMessage({
            userMessage: 'bu konuda destek istiyorum',
            requiresHumanHandover: true,
            match: {
                skill_id: 'skill-4',
                title: 'İnsan Desteği Talebi',
                response_text: '...',
                trigger_text: 'Bu konuda destek istiyorum',
                similarity: 0.61
            }
        })

        expect(accepted).toBe(true)
    })

    it('accepts very high-similarity handover matches as safety bypass', () => {
        const accepted = shouldUseSkillMatchForMessage({
            userMessage: 'hizmetleriniz hakkında bilgi almak istiyorum',
            requiresHumanHandover: true,
            match: {
                skill_id: 'skill-5',
                title: 'İnsan Desteği Talebi',
                response_text: '...',
                trigger_text: 'Beni bir insana bağlar mısınız?',
                similarity: 0.96
            }
        })

        expect(accepted).toBe(true)
    })
})
