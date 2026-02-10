import { describe, expect, it } from 'vitest'
import {
    buildLeadExtractionConversationContext,
    mergeExtractionWithExisting,
    normalizeUndeterminedLeadStatus,
    resolveLeadExtractionLocale,
    safeParseLeadExtraction,
    shouldAcceptInferredServiceType
} from '@/lib/leads/extraction'

describe('safeParseLeadExtraction', () => {
    it('fills defaults on invalid payloads', () => {
        const result = safeParseLeadExtraction('{"service_type": "Newborn"}')
        expect(result.service_type).toBe('Newborn')
        expect(result.non_business).toBe(false)
        expect(result.score).toBe(0)
        expect(result.status).toBe('cold')
    })

    it('parses JSON wrapped in code fences', () => {
        const result = safeParseLeadExtraction('```json\n{"service_type":"Yenidoğan","intent_signals":["decisive"]}\n```')
        expect(result.service_type).toBe('Yenidoğan')
        expect(result.intent_signals).toEqual(['decisive'])
    })

    it('parses JSON when extra text surrounds the payload', () => {
        const result = safeParseLeadExtraction('Here is the result:\n{"service_type":"Yenidoğan","budget_signals":"price"}\nThanks.')
        expect(result.service_type).toBe('Yenidoğan')
        expect(result.budget_signals).toEqual(['price'])
    })

    it('normalizes scalar fields into arrays and booleans', () => {
        const result = safeParseLeadExtraction('{"intent_signals":"decisive","risk_signals":["delay", 1],"non_business":"false"}')
        expect(result.intent_signals).toEqual(['decisive'])
        expect(result.risk_signals).toEqual(['delay'])
        expect(result.non_business).toBe(false)
    })

    it('normalizes score and status values', () => {
        const result = safeParseLeadExtraction('{"score": 8.4, "status": "HOT"}')
        expect(result.score).toBe(8)
        expect(result.status).toBe('hot')
    })

    it('overrides score/status for non-business', () => {
        const result = safeParseLeadExtraction('{"score": 9, "status": "hot", "non_business": true}')
        expect(result.score).toBe(0)
        expect(result.status).toBe('ignored')
    })

    it('accepts localized score/status strings', () => {
        const result = safeParseLeadExtraction('{"score": "9/10", "status": "Sıcak"}')
        expect(result.score).toBe(9)
        expect(result.status).toBe('hot')
    })

    it('accepts undetermined status aliases', () => {
        const result = safeParseLeadExtraction('{"score": 1, "status": "Belirsiz"}')
        expect(result.score).toBe(1)
        expect(result.status).toBe('undetermined')
    })

    it('normalizes required_intake_collected object values', () => {
        const result = safeParseLeadExtraction('{"required_intake_collected":{"Telefon":" 555 ","Bütçe":["15.000 TL",1],"Ad Soyad":" "}}')
        expect(result.required_intake_collected).toEqual({
            Telefon: '555',
            'Bütçe': '15.000 TL'
        })
    })
})

describe('mergeExtractionWithExisting', () => {
    it('keeps summary aligned and clears service when incoming extraction has no service', () => {
        const merged = mergeExtractionWithExisting(
            {
                service_type: null,
                desired_date: null,
                location: null,
                budget_signals: [],
                intent_signals: [],
                risk_signals: ['indecisive'],
                required_intake_collected: {},
                non_business: true,
                summary: null,
                score: 0,
                status: 'ignored'
            },
            {
                service_type: 'Yenidoğan çekimi',
                summary: 'Müşteri randevu istiyor.',
                extracted_fields: {
                    desired_date: '1 Mart',
                    location: 'Kadıköy',
                    budget_signals: ['15.000 TL'],
                    intent_signals: ['decisive'],
                    required_intake_collected: {
                        Telefon: '05550000000',
                        'Doğum Tarihi': '1 Mart'
                    }
                }
            }
        )

        expect(merged.service_type).toBeNull()
        expect(merged.summary).toBeNull()
        expect(merged.desired_date).toBe('1 Mart')
        expect(merged.location).toBe('Kadıköy')
        expect(merged.budget_signals).toEqual(['15.000 TL'])
        expect(merged.intent_signals).toEqual(['decisive'])
        expect(merged.required_intake_collected).toEqual({
            Telefon: '05550000000',
            'Doğum Tarihi': '1 Mart'
        })
        expect(merged.risk_signals).toEqual(['indecisive'])
    })

    it('updates persisted values when incoming extraction provides new ones', () => {
        const merged = mergeExtractionWithExisting(
            {
                service_type: '1 yaş çekimi',
                desired_date: '5 Nisan',
                location: 'Üsküdar',
                budget_signals: ['20.000 TL'],
                intent_signals: ['urgent'],
                risk_signals: [],
                required_intake_collected: {
                    Telefon: '05551112233'
                },
                non_business: false,
                summary: 'Müşteri tarihi güncelledi.',
                score: 8,
                status: 'hot'
            },
            {
                service_type: 'Yenidoğan çekimi',
                summary: 'Eski özet',
                extracted_fields: {
                    desired_date: '1 Mart',
                    required_intake_collected: {
                        Telefon: '05550000000',
                        'Doğum Tarihi': '1 Mart'
                    }
                }
            }
        )

        expect(merged.service_type).toBe('1 yaş çekimi')
        expect(merged.desired_date).toBe('5 Nisan')
        expect(merged.location).toBe('Üsküdar')
        expect(merged.summary).toBe('Müşteri tarihi güncelledi.')
        expect(merged.required_intake_collected).toEqual({
            Telefon: '05551112233',
            'Doğum Tarihi': '1 Mart'
        })
    })
})

describe('resolveLeadExtractionLocale', () => {
    it('respects explicit locale override', () => {
        const locale = resolveLeadExtractionLocale({
            preferredLocale: 'tr',
            customerMessages: ['hello']
        })
        expect(locale).toBe('tr')
    })

    it('detects Turkish in mixed conversation history', () => {
        const locale = resolveLeadExtractionLocale({
            customerMessages: ['selam canım', 'randevu almak istiyorum', 'vazgeçtim', 'hello'],
            latestMessage: 'fiyat'
        })
        expect(locale).toBe('tr')
    })

    it('detects English when conversation is English only', () => {
        const locale = resolveLeadExtractionLocale({
            customerMessages: ['hello', 'i want to book an appointment'],
            latestMessage: 'price'
        })
        expect(locale).toBe('en')
    })

    it('defaults to Turkish when no signal is provided', () => {
        const locale = resolveLeadExtractionLocale()
        expect(locale).toBe('tr')
    })

    it('prefers organization locale when explicit preferred locale is not provided', () => {
        const locale = resolveLeadExtractionLocale({
            organizationLocale: 'tr',
            customerMessages: ['hello']
        } as unknown as Parameters<typeof resolveLeadExtractionLocale>[0])
        expect(locale).toBe('tr')
    })
})

describe('shouldAcceptInferredServiceType', () => {
    it('rejects inferred service on generic greeting-only messages', () => {
        const accept = shouldAcceptInferredServiceType({
            serviceType: 'Yenidoğan fotoğraf çekimi',
            customerMessages: ['Hello']
        })
        expect(accept).toBe(false)
    })

    it('accepts service when customer explicitly mentions service text', () => {
        const accept = shouldAcceptInferredServiceType({
            serviceType: 'Yenidoğan fotoğraf çekimi',
            customerMessages: ['Yenidoğan fotoğraf çekimi fiyatı nedir?']
        })
        expect(accept).toBe(true)
    })

    it('accepts service when customer message matches catalog aliases', () => {
        const accept = shouldAcceptInferredServiceType({
            serviceType: 'Yenidoğan fotoğraf çekimi',
            customerMessages: ['newborn shoot price?'],
            catalogItems: [
                {
                    name: 'Yenidoğan fotoğraf çekimi',
                    aliases: ['newborn shoot']
                }
            ]
        })
        expect(accept).toBe(true)
    })
})

describe('buildLeadExtractionConversationContext', () => {
    it('maps recent messages into assistant/customer/owner turns for extraction context', () => {
        const result = buildLeadExtractionConversationContext({
            messages: [
                { sender_type: 'contact', content: 'Evet', created_at: '2026-02-10T10:04:00Z' },
                { sender_type: 'user', content: 'Doğum tarihiniz 1 Mart mı?', created_at: '2026-02-10T10:03:00Z' },
                { sender_type: 'bot', content: 'Doğum tarihinizi paylaşabilir misiniz?', created_at: '2026-02-10T10:02:00Z' },
                { sender_type: 'contact', content: 'Randevu almak istiyorum', created_at: '2026-02-10T10:01:00Z' }
            ]
        })

        expect(result.conversationTurns).toEqual([
            'customer: Randevu almak istiyorum',
            'assistant: Doğum tarihinizi paylaşabilir misiniz?',
            'owner: Doğum tarihiniz 1 Mart mı?',
            'customer: Evet'
        ])
        expect(result.customerMessages).toEqual([
            'Randevu almak istiyorum',
            'Evet'
        ])
    })

    it('injects latest customer message when it is missing from loaded history', () => {
        const result = buildLeadExtractionConversationContext({
            messages: [
                { sender_type: 'user', content: 'Doğum tarihiniz 1 Mart mı?', created_at: '2026-02-10T10:03:00Z' }
            ],
            latestCustomerMessage: 'Evet'
        })

        expect(result.conversationTurns).toEqual([
            'owner: Doğum tarihiniz 1 Mart mı?',
            'customer: Evet'
        ])
        expect(result.customerMessages).toEqual(['Evet'])
    })

    it('keeps only the last N turns and last 5 customer messages', () => {
        const result = buildLeadExtractionConversationContext({
            messages: [
                { sender_type: 'contact', content: 'm6' },
                { sender_type: 'contact', content: 'm5' },
                { sender_type: 'contact', content: 'm4' },
                { sender_type: 'contact', content: 'm3' },
                { sender_type: 'contact', content: 'm2' },
                { sender_type: 'contact', content: 'm1' }
            ],
            maxTurns: 3
        })

        expect(result.conversationTurns).toEqual([
            'customer: m4',
            'customer: m5',
            'customer: m6'
        ])
        expect(result.customerMessages).toEqual([
            'm2',
            'm3',
            'm4',
            'm5',
            'm6'
        ])
    })
})

describe('normalizeUndeterminedLeadStatus', () => {
    it('marks greeting-only conversations as undetermined', () => {
        const result = normalizeUndeterminedLeadStatus({
            extracted: safeParseLeadExtraction('{"score": 4, "status": "cold", "service_type": null, "summary": "Selamlaştı"}'),
            customerMessages: ['merhaba']
        })

        expect(result.status).toBe('undetermined')
        expect(result.score).toBe(2)
    })

    it('keeps status when customer intent is explicit', () => {
        const result = normalizeUndeterminedLeadStatus({
            extracted: safeParseLeadExtraction('{"score": 7, "status": "warm", "intent_signals": ["decisive"], "summary": "Randevu almak istiyor"}'),
            customerMessages: ['Merhaba, randevu olmak istiyorum.']
        })

        expect(result.status).toBe('warm')
        expect(result.score).toBe(7)
    })

    it('overrides non_business greeting-only outputs to undetermined', () => {
        const result = normalizeUndeterminedLeadStatus({
            extracted: safeParseLeadExtraction('{"score": 0, "status": "ignored", "non_business": true, "summary": "Sadece selam verdi"}'),
            customerMessages: ['hello', 'merhaba']
        })

        expect(result.non_business).toBe(false)
        expect(result.status).toBe('undetermined')
        expect(result.score).toBe(0)
    })
})
