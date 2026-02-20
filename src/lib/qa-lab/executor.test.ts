import { describe, expect, it } from 'vitest'

import {
    buildExecutionErrorReport,
    createGeneratorRetryUserPrompt,
    expandFixtureLinesToMinimum,
    QaLabExecutionError,
    validateGeneratorOutputQuality
} from '@/lib/qa-lab/executor'

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

describe('qa lab executor helpers', () => {
    it('keeps base generator user prompt on first attempt', () => {
        const basePrompt = '{"run_constraints":{"scenario_count":12}}'

        const prompt = createGeneratorRetryUserPrompt(basePrompt, 1, null)

        expect(prompt).toBe(basePrompt)
    })

    it('adds retry hint after a failed generator attempt', () => {
        const basePrompt = '{"run_constraints":{"scenario_count":12}}'
        const prompt = createGeneratorRetryUserPrompt(
            basePrompt,
            2,
            'Generator output has 12 fixture lines, below required minimum 200'
        )

        expect(prompt).toContain(basePrompt)
        expect(prompt).toContain('Previous attempt failed')
        expect(prompt).toContain('below required minimum 200')
        expect(prompt).toContain('at least')
    })

    it('adds sector and qualification hints when generator is support-heavy', () => {
        const basePrompt = '{"run_constraints":{"scenario_count":12}}'
        const prompt = createGeneratorRetryUserPrompt(
            basePrompt,
            2,
            'Generator scenarios are support-heavy (9/12); include more lead qualification flows.'
        )

        expect(prompt).toContain('concrete SMB sector')
        expect(prompt).toContain('lead qualification')
    })

    it('expands fixture lines to required minimum when generator returns too few', () => {
        const expanded = expandFixtureLinesToMinimum(
            ['satir 1', 'satir 2'],
            8
        )

        expect(expanded.length).toBe(8)
        expect(expanded[0]).toBe('satir 1')
        expect(expanded[1]).toBe('satir 2')
    })

    it('builds fallback fixture lines when generator returns empty list', () => {
        const expanded = expandFixtureLinesToMinimum([], 5)

        expect(expanded.length).toBe(5)
        expect(expanded[0]).toContain('Fixture fallback line')
    })

    it('rejects generic support-heavy generator outputs', () => {
        const qualityError = validateGeneratorOutputQuality(
            {
                kb_fixture: {
                    title: 'Musteri Hizmetleri',
                    lines: [
                        'Sizi ekibimize aktariyoruz.',
                        'Musteri temsilcimiz size donecek.',
                        'Insan destegi icin kaydinizi aldik.',
                        'Sikayetinizi ekibe iletiyoruz.'
                    ]
                },
                ground_truth: {
                    canonical_services: ['Insan destegi', 'Sikayet'],
                    required_intake_fields: ['Ad', 'Telefon'],
                    critical_policy_facts: ['Politika 1'],
                    disallowed_fabricated_claims: ['Claim 1']
                },
                derived_setup: {
                    offering_profile_summary: 'Genel destek',
                    service_catalog: ['Insan destegi'],
                    required_intake_fields: ['Ad']
                },
                scenarios: [
                    {
                        id: 'S1',
                        title: 'Insana bagla',
                        goal: 'Musteri temsilcisine aktarim',
                        customer_profile: 'Destek isteyen musteri',
                        lead_temperature: 'warm',
                        information_sharing: 'cooperative',
                        turns: [
                            { customer: 'Beni temsilciye baglayin' },
                            { customer: 'Sikayetim var' }
                        ]
                    },
                    {
                        id: 'S2',
                        title: 'Destek',
                        goal: 'Ekibe aktarim',
                        customer_profile: 'Destek isteyen musteri',
                        lead_temperature: 'hot',
                        information_sharing: 'cooperative',
                        turns: [
                            { customer: 'Acil ekibe bagla' },
                            { customer: 'Hemen temsilci lazim' }
                        ]
                    },
                    {
                        id: 'S3',
                        title: 'Sikayet',
                        goal: 'Sikayet aktarimi',
                        customer_profile: 'Destek isteyen musteri',
                        lead_temperature: 'cold',
                        information_sharing: 'resistant',
                        turns: [
                            { customer: 'Sikayetimi iletin' },
                            { customer: 'Insan destegi isterim' }
                        ]
                    }
                ]
            },
            {
                fixture_min_lines: 4,
                scenario_count: 3
            } as unknown as Parameters<typeof validateGeneratorOutputQuality>[1]
        )

        expect(qualityError).toContain('generic support-domain')
    })

    it('accepts diverse lead-qualification generator outputs', () => {
        const qualityError = validateGeneratorOutputQuality(
            {
                kb_fixture: {
                    title: 'Nova Klinik Psikoloji',
                    lines: [
                        'Bireysel terapi seanslari 50 dakika surer.',
                        'Ilk gorusmede hedef, surec beklentisi ve zaman plani konusulur.',
                        'Hafta ici aksam saatleri icin randevu kontenjani sinirlidir.',
                        'Fiyat araligi seans tipi ve sikliga gore degisir.',
                        'Online ve yuz yuze seans secenekleri sunulur.',
                        'Yeni danisanlar icin on gorusme formu doldurulur.'
                    ]
                },
                ground_truth: {
                    canonical_services: ['Bireysel terapi', 'Cift terapisi', 'Online terapi'],
                    required_intake_fields: ['Ad soyad', 'Iletisim', 'Tercih edilen gun'],
                    critical_policy_facts: ['Seans iptal politikasi 24 saat once bildirim gerektirir.'],
                    disallowed_fabricated_claims: ['Ucretsiz tedavi garantisi']
                },
                derived_setup: {
                    offering_profile_summary: 'Yetiskinler icin terapi ve psikolojik danismanlik hizmeti.',
                    service_catalog: ['Bireysel terapi', 'Cift terapisi', 'Online terapi'],
                    required_intake_fields: ['Ad soyad', 'Iletisim', 'Tercih edilen gun']
                },
                scenarios: [
                    {
                        id: 'S1',
                        title: 'Seans uygunluk sorusu',
                        goal: 'Musterinin tarih ve butce uygunlugunu netlestir',
                        customer_profile: 'Karar vermeye yakin',
                        lead_temperature: 'hot',
                        information_sharing: 'cooperative',
                        turns: [
                            { customer: 'Bu hafta aksam randevu ve fiyat ogrenmek istiyorum.' },
                            { customer: 'Butcem aylik 6-8 bin, hangi paket uygun olur?' }
                        ]
                    },
                    {
                        id: 'S2',
                        title: 'Hizmet kapsami',
                        goal: 'Hangi terapi turunun uygun oldugunu belirle',
                        customer_profile: 'Arastirma asamasinda',
                        lead_temperature: 'warm',
                        information_sharing: 'partial',
                        turns: [
                            { customer: 'Online hizmet var mi, sureci anlatir misiniz?' },
                            { customer: 'Hafta sonu mumkunse devam etmek isterim.' }
                        ]
                    },
                    {
                        id: 'S3',
                        title: 'Kararsiz ama ilgili',
                        goal: 'Eksik bilgi toplayip sonraki adimi planla',
                        customer_profile: 'Bilgi paylasimi dusuk',
                        lead_temperature: 'cold',
                        information_sharing: 'resistant',
                        turns: [
                            { customer: 'Net tarih veremiyorum ama destek almak istiyorum.' },
                            { customer: 'Once genel fiyat araligini ogrenmek isterim.' }
                        ]
                    }
                ]
            },
            {
                fixture_min_lines: 6,
                scenario_count: 3
            } as unknown as Parameters<typeof validateGeneratorOutputQuality>[1]
        )

        expect(qualityError).toBeNull()
    })

    it('includes execution metadata in report for qa execution errors', () => {
        const report = buildExecutionErrorReport(
            new QaLabExecutionError('Generator response is not valid JSON', {
                stage: 'generator',
                maxAttempts: 3,
                attempts: [
                    {
                        attempt: 1,
                        finishReason: 'length',
                        outputChars: 2100,
                        validationError: 'Generator response is not valid JSON'
                    }
                ]
            })
        )

        const reportRecord = toRecord(report)
        const errorRecord = toRecord(reportRecord.error)
        const detailsRecord = toRecord(errorRecord.details)

        expect(errorRecord.message).toBe('Generator response is not valid JSON')
        expect(detailsRecord.stage).toBe('generator')
        expect(detailsRecord.maxAttempts).toBe(3)
        expect(Array.isArray(detailsRecord.attempts)).toBe(true)
    })
})
