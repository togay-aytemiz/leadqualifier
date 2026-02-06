import { describe, expect, it } from 'vitest'
import { resolveCollectedRequiredIntake } from '@/lib/leads/required-intake'

describe('resolveCollectedRequiredIntake', () => {
    it('returns collected required fields from required_intake_collected object', () => {
        const result = resolveCollectedRequiredIntake({
            requiredFields: ['Doğum Tarihi', 'Telefon', 'İstenen Tarih Aralığı'],
            extractedFields: {
                required_intake_collected: {
                    'doğum tarihi': 'Yarın doğacak',
                    Telefon: '0555 000 00 00',
                    'İstenen Tarih Aralığı': '10-15 Şubat',
                    Not: 'opsiyonel'
                }
            }
        })

        expect(result).toEqual([
            { field: 'Doğum Tarihi', value: 'Yarın doğacak' },
            { field: 'Telefon', value: '0555 000 00 00' },
            { field: 'İstenen Tarih Aralığı', value: '10-15 Şubat' }
        ])
    })

    it('falls back to core extracted fields when required_intake_collected is missing', () => {
        const result = resolveCollectedRequiredIntake({
            requiredFields: ['Hizmet', 'Konum', 'Tarih', 'Bütçe'],
            serviceType: 'Yenidoğan çekimi',
            extractedFields: {
                desired_date: 'yarın',
                location: 'Kadıköy',
                budget_signals: ['15.000 TL']
            }
        })

        expect(result).toEqual([
            { field: 'Hizmet', value: 'Yenidoğan çekimi' },
            { field: 'Konum', value: 'Kadıköy' },
            { field: 'Tarih', value: 'yarın' },
            { field: 'Bütçe', value: '15.000 TL' }
        ])
    })

    it('skips required fields that still have no collected value', () => {
        const result = resolveCollectedRequiredIntake({
            requiredFields: ['Ad Soyad', 'Telefon'],
            extractedFields: {
                required_intake_collected: {
                    'ad soyad': '  ',
                    Telefon: '555'
                }
            }
        })

        expect(result).toEqual([
            { field: 'Telefon', value: '555' }
        ])
    })

    it('prefers manual overrides over ai collected values when present', () => {
        const result = resolveCollectedRequiredIntake({
            requiredFields: ['Telefon'],
            extractedFields: {
                required_intake_collected: {
                    Telefon: '0555 000 00 00'
                },
                required_intake_overrides: {
                    telefon: '0555 111 11 11'
                }
            }
        })

        expect(result).toEqual([
            { field: 'Telefon', value: '0555 111 11 11' }
        ])
    })
})
