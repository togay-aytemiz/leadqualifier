import { describe, expect, it } from 'vitest'

import {
    buildClarificationGateResult,
    buildPriceClarificationQuestion,
    shouldAskPriceClarification
} from '@/lib/knowledge-base/rag-clarification'

describe('rag clarification', () => {
    it('detects price questions with no clear subject', () => {
        expect(shouldAskPriceClarification('Okumak kaç para?')).toBe(true)
        expect(shouldAskPriceClarification('Ücretler ne kadar?')).toBe(true)
        expect(shouldAskPriceClarification('Bu program kaç para?')).toBe(true)
    })

    it('does not clarify when the price question names a concrete subject', () => {
        expect(shouldAskPriceClarification('Tıp kaç para?')).toBe(false)
        expect(shouldAskPriceClarification('Botoks fiyatı nedir?')).toBe(false)
        expect(shouldAskPriceClarification('Yurtlar kaç para?')).toBe(false)
    })

    it('builds a concise locale-aware clarification question', () => {
        expect(buildPriceClarificationQuestion('tr')).toBe(
            'Hangi hizmet, program veya seçenek için ücret bilgisini öğrenmek istiyorsunuz?'
        )
        expect(buildPriceClarificationQuestion('tr', 'education')).toBe(
            'Hangi bölüm, program veya hizmet için ücret bilgisini öğrenmek istiyorsunuz?'
        )
        expect(buildPriceClarificationQuestion('en')).toBe(
            'Which program, service, or option would you like pricing for?'
        )
    })

    it('asks contextual clarification for other under-specified intent families', () => {
        expect(buildClarificationGateResult({
            message: 'İletişim bilgisi nedir?',
            language: 'tr'
        })).toMatchObject({
            kind: 'contact',
            reason: 'missing_contact_subject',
            question: 'Hangi kişi, birim veya hizmet için iletişim bilgisini öğrenmek istiyorsunuz?'
        })

        expect(buildClarificationGateResult({
            message: 'Nerede?',
            language: 'tr',
            context: 'education'
        })).toMatchObject({
            kind: 'location',
            reason: 'missing_location_subject',
            question: 'Hangi bölüm, kampüs veya birimin konumunu öğrenmek istiyorsunuz?'
        })

        expect(buildClarificationGateResult({
            message: 'Bilgi alabilir miyim?',
            language: 'tr'
        })).toMatchObject({
            kind: 'generic',
            reason: 'missing_topic',
            question: 'Hangi konu hakkında bilgi almak istiyorsunuz?'
        })

        expect(buildClarificationGateResult({
            message: 'Daha fazla bilgi alabilir miyim?',
            language: 'tr'
        })).toMatchObject({
            kind: 'generic',
            reason: 'missing_topic',
            question: 'Hangi konu hakkında bilgi almak istiyorsunuz?'
        })

        expect(buildClarificationGateResult({
            message: 'Nasıl oluyor?',
            language: 'tr'
        })).toMatchObject({
            kind: 'generic',
            reason: 'missing_topic',
            question: 'Hangi konu hakkında bilgi almak istiyorsunuz?'
        })

        expect(buildClarificationGateResult({
            message: 'Ne demek?',
            language: 'tr'
        })).toMatchObject({
            kind: 'generic',
            reason: 'missing_topic',
            question: 'Hangi konu hakkında bilgi almak istiyorsunuz?'
        })

        expect(buildClarificationGateResult({
            message: 'Nerede acaba?',
            language: 'tr',
            context: 'education'
        })).toMatchObject({
            kind: 'location',
            reason: 'missing_location_subject',
            question: 'Hangi bölüm, kampüs veya birimin konumunu öğrenmek istiyorsunuz?'
        })
    })

    it('does not clarify concrete questions or refusal turns', () => {
        expect(buildClarificationGateResult({
            message: 'Öğrenci işleri iletişim bilgisi nedir?',
            language: 'tr'
        })).toBeNull()
        expect(buildClarificationGateResult({
            message: 'Tıp Fakültesi nerede?',
            language: 'tr',
            context: 'education'
        })).toBeNull()
        expect(buildClarificationGateResult({
            message: 'Kayıt nasıl oluyor?',
            language: 'tr'
        })).toBeNull()
        expect(buildClarificationGateResult({
            message: 'Paylaşmak istemiyorum',
            language: 'tr'
        })).toBeNull()
    })
})
