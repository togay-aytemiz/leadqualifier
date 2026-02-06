import { describe, expect, it } from 'vitest'
import { mergeExtractionWithExisting, safeParseLeadExtraction } from '@/lib/leads/extraction'

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

    it('normalizes required_intake_collected object values', () => {
        const result = safeParseLeadExtraction('{"required_intake_collected":{"Telefon":" 555 ","Bütçe":["15.000 TL",1],"Ad Soyad":" "}}')
        expect(result.required_intake_collected).toEqual({
            Telefon: '555',
            'Bütçe': '15.000 TL'
        })
    })
})

describe('mergeExtractionWithExisting', () => {
    it('preserves previously collected lead fields when incoming extraction omits them', () => {
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

        expect(merged.service_type).toBe('Yenidoğan çekimi')
        expect(merged.summary).toBe('Müşteri randevu istiyor.')
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
