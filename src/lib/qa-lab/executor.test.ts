import { describe, expect, it } from 'vitest'

import {
    adaptQaLabCustomerTurnToAssistantContext,
    buildExecutionErrorReport,
    calculateJudgeTargetOutputTokens,
    createGeneratorRetryUserPrompt,
    enrichAssistantResponseWhenLowInformation,
    ensureActiveMissingFieldQuestion,
    ensureHotCooperativeCriticalFieldQuestion,
    enforceGeneralInformationBaselineResponse,
    enforceFieldNamedClarificationQuestion,
    expandFixtureLinesToMinimum,
    filterJudgeFindingsByCitationConsistency,
    normalizeJudgeScenarioAssessmentsForExecutedCases,
    normalizeRequiredIntakeFieldsForQaLab,
    moveAnswerChunkFirstForDirectQuestion,
    promoteQaLabScenarioRequestMode,
    QaLabExecutionError,
    refineQaLabGenericUnknownResponse,
    resolveQaLabScenarioRequiredIntakeFields,
    sanitizeExternalContactRedirectResponse,
    sanitizeAssistantResponseForTruncation,
    shouldRetryJudgeForScoreAnomaly,
    shouldUseNoProgressNextStepResponse,
    stripEngagementQuestionsAfterStopContact,
    stripIntakeQuestionsAfterRefusal,
    stripIntakeQuestionsForNonQualificationMode,
    stripBlockedFieldQuestionsFromAssistantResponse,
    stabilizeGeneratorOutputForQuality,
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
        expect(expanded[0]).not.toContain('Fixture fallback line')
        expect(expanded.some((line) => /fixture fallback line/i.test(line))).toBe(false)
    })

    it('sanitizes repeated expansion suffix artifacts while expanding fixture lines', () => {
        const expanded = expandFixtureLinesToMinimum(
            [
                'Hizmet kapsamı birlikte netleştirilir. Devamında kapsam ve beklenti netleştirilir. Devamında kapsam ve beklenti netleştirilir.'
            ],
            3
        )

        expect(expanded.length).toBe(3)
        expect(expanded[0]).not.toContain('Devamında kapsam ve beklenti netleştirilir. Devamında kapsam ve beklenti netleştirilir.')
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

    it('rejects scenario outputs when one lead-temperature bucket is missing', () => {
        const qualityError = validateGeneratorOutputQuality(
            {
                kb_fixture: {
                    title: 'Atlas Veteriner',
                    lines: [
                        'Asi, muayene ve check-up hizmetleri sunulur.',
                        'Fiyatlar kapsam ve ziyaret tipine gore degisir.',
                        'Randevu uygunlugu gun ve saate gore planlanir.',
                        'Ilk gorusmede ihtiyac ve aciliyet seviyesi netlestirilir.',
                        'Online bilgilendirme ve takip secenegi vardir.',
                        'Musteri hedefleri ve kapsam siniri birlikte belirlenir.'
                    ]
                },
                ground_truth: {
                    canonical_services: ['Genel muayene', 'Asi takibi', 'Check-up'],
                    required_intake_fields: ['Hizmet türü', 'Bütçe', 'Zaman dilimi'],
                    critical_policy_facts: ['Fiyatlar kapsam ve sureye gore degisir.'],
                    disallowed_fabricated_claims: ['Kesin tedavi garantisi']
                },
                derived_setup: {
                    offering_profile_summary: 'Veteriner klinigi',
                    service_catalog: ['Genel muayene', 'Asi takibi', 'Check-up'],
                    required_intake_fields: ['Hizmet türü', 'Bütçe', 'Zaman dilimi']
                },
                scenarios: [
                    {
                        id: 'S1',
                        title: 'Acil sorusu',
                        goal: 'Hizmet uygunlugu ve fiyat beklentisi',
                        customer_profile: 'Karar vermeye yakin',
                        lead_temperature: 'hot',
                        information_sharing: 'cooperative',
                        turns: [
                            { customer: 'Bugun acil bir randevu ve fiyat bilgisi istiyorum.' },
                            { customer: 'Butcem 3-4 bin TL civari.' }
                        ]
                    },
                    {
                        id: 'S2',
                        title: 'Planlama sorusu',
                        goal: 'Randevu ve kapsam netlestirme',
                        customer_profile: 'Arastirma asamasinda',
                        lead_temperature: 'warm',
                        information_sharing: 'partial',
                        turns: [
                            { customer: 'Asi takvimi icin uygun tarih var mi?' },
                            { customer: 'Fiyat araligi nedir?' }
                        ]
                    },
                    {
                        id: 'S3',
                        title: 'Genel bilgi',
                        goal: 'Hizmet ve fiyat ogrenme',
                        customer_profile: 'Arastirma asamasinda',
                        lead_temperature: 'warm',
                        information_sharing: 'resistant',
                        turns: [
                            { customer: 'Genel hizmetleri ve fiyatlarinizi ogrenebilir miyim?' },
                            { customer: 'Detaylari sonra netlestirelim.' }
                        ]
                    }
                ]
            },
            {
                fixture_min_lines: 6,
                scenario_count: 3
            } as unknown as Parameters<typeof validateGeneratorOutputQuality>[1]
        )

        expect(qualityError).toContain('temperature coverage')
    })

    it('rejects scenario outputs when resistant information-sharing coverage is missing', () => {
        const qualityError = validateGeneratorOutputQuality(
            {
                kb_fixture: {
                    title: 'Nova Danismanlik',
                    lines: [
                        'Bireysel danismanlik ve grup oturumlari sunulur.',
                        'Hizmet bedeli kapsam ve sureye gore degisir.',
                        'Uygun zamanlama icin tarih araligi paylasilir.',
                        'Ilk gorusmede hedef, kapsam ve aciliyet netlestirilir.',
                        'Takip sureci haftalik raporlarla ilerler.',
                        'Karar sureci once ihtiyac analiziyle baslar.'
                    ]
                },
                ground_truth: {
                    canonical_services: ['Bireysel danışmanlık', 'Grup danışmanlığı', 'Online destek'],
                    required_intake_fields: ['Hizmet türü', 'Bütçe', 'Proje aciliyet seviyesi'],
                    critical_policy_facts: ['Fiyatlar hizmet turu ve sureye gore degisir.'],
                    disallowed_fabricated_claims: ['Kesin sonuç garantisi']
                },
                derived_setup: {
                    offering_profile_summary: 'KOBI danismanlik ofisi',
                    service_catalog: ['Bireysel danışmanlık', 'Grup danışmanlığı', 'Online destek'],
                    required_intake_fields: ['Hizmet türü', 'Bütçe', 'Proje aciliyet seviyesi']
                },
                scenarios: [
                    {
                        id: 'S1',
                        title: 'Hizli baslangic',
                        goal: 'Fiyat ve zamanlama netlestirme',
                        customer_profile: 'Karar vermeye yakin',
                        lead_temperature: 'hot',
                        information_sharing: 'cooperative',
                        turns: [
                            { customer: 'Hizli baslamak istiyorum, fiyat araligi nedir?' },
                            { customer: 'Butcem 10 bin TL civarinda.' }
                        ]
                    },
                    {
                        id: 'S2',
                        title: 'Uygunluk sorusu',
                        goal: 'Kapsam ve sure netlestirme',
                        customer_profile: 'Kararsiz musteri',
                        lead_temperature: 'warm',
                        information_sharing: 'partial',
                        turns: [
                            { customer: 'Onumuzdeki ay icin uygun zaman var mi?' },
                            { customer: 'Kapsami birlikte netlestirebiliriz.' }
                        ]
                    },
                    {
                        id: 'S3',
                        title: 'Soguk arastirma',
                        goal: 'Genel bilgi ve fiyat sorusu',
                        customer_profile: 'Arastirma odakli',
                        lead_temperature: 'cold',
                        information_sharing: 'cooperative',
                        turns: [
                            { customer: 'Sadece genel bir fiyat ve hizmet bilgisi almak istiyorum.' },
                            { customer: 'Ileride karar verecegim.' }
                        ]
                    }
                ]
            },
            {
                fixture_min_lines: 6,
                scenario_count: 3
            } as unknown as Parameters<typeof validateGeneratorOutputQuality>[1]
        )

        expect(qualityError).toContain('resistant case')
    })

    it('rejects fixture outputs dominated by templated fallback-style lines', () => {
        const baseLines = [
            'Atlas Merkez kobi muhasebe hizmeti sunar.',
            'Vergi danismanligi hizmeti vardir.',
            'Bordro yonetimi destegi sunulur.',
            'Finansal raporlama hizmeti vardir.',
            'Paketler ihtiyaca gore degisir.'
        ]
        const lines = [
            ...baseLines,
            ...baseLines.map((line) => `${line} Devamında kapsam ve beklenti netleştirilir.`),
            ...baseLines.map((line) => `${line} Süreç adımları müşteri onayına göre ilerler.`),
            ...Array.from({ length: 20 }).map((_, index) => (
                `Fixture fallback line ${index + 1}: Detay için ek bilgi alınır.`
            ))
        ]

        const qualityError = validateGeneratorOutputQuality(
            {
                kb_fixture: {
                    title: 'Atlas Muhasebe',
                    lines
                },
                ground_truth: {
                    canonical_services: ['Vergi danışmanlığı', 'Bordro yönetimi', 'Finansal raporlama'],
                    required_intake_fields: ['İşletme büyüklüğü', 'Bütçe', 'Hizmet ihtiyacı'],
                    critical_policy_facts: ['Fiyatlar kapsama göre değişir.'],
                    disallowed_fabricated_claims: ['%100 başarı garantisi']
                },
                derived_setup: {
                    offering_profile_summary: 'Muhasebe ofisi',
                    service_catalog: ['Vergi danışmanlığı', 'Bordro yönetimi'],
                    required_intake_fields: ['İşletme büyüklüğü', 'Bütçe']
                },
                scenarios: Array.from({ length: 5 }).map((_, index) => ({
                    id: `S${index + 1}`,
                    title: `Senaryo ${index + 1}`,
                    goal: 'Lead qualification',
                    customer_profile: 'KOBI sahibi',
                    lead_temperature: 'warm' as const,
                    information_sharing: 'partial' as const,
                    turns: [
                        { customer: 'Fiyat ve kapsam bilgisi istiyorum.' },
                        { customer: 'Bütçem sınırlı ama hızlı başlamak istiyorum.' }
                    ]
                }))
            },
            {
                fixture_min_lines: 20,
                scenario_count: 5
            } as unknown as Parameters<typeof validateGeneratorOutputQuality>[1]
        )

        expect(qualityError).toBeTruthy()
    })

    it('stabilizes low-diversity fixture output before quality validation', () => {
        const repetitiveSeed = [
            'Pera Akademi, ogrencilere ozel ders hizmeti sunar.',
            'Fiyatlar hizmet kapsamina gore degisir.',
            'Bireysel ders ve online secenek bulunur.',
            'Ihtiyaca gore program olusturulur.',
            'Ilk gorusmede beklenti netlestirilir.'
        ]
        const repetitiveLines = Array.from({ length: 30 }).map((_, index) => (
            `${repetitiveSeed[index % repetitiveSeed.length]} Devaminda kapsam ve beklenti netlestirilir.`
        ))

        const stabilized = stabilizeGeneratorOutputForQuality(
            {
                kb_fixture: {
                    title: 'Pera Akademi - Ozel Ders',
                    lines: repetitiveLines
                },
                ground_truth: {
                    canonical_services: ['Ozel ders', 'Egitim koclugu'],
                    required_intake_fields: ['Butce', 'Hedef konu', 'Iletisim tercihleri'],
                    critical_policy_facts: ['Fiyat kapsama gore degisir.'],
                    disallowed_fabricated_claims: ['%100 garanti']
                },
                derived_setup: {
                    offering_profile_summary: 'Egitim hizmeti',
                    service_catalog: ['Ozel ders', 'Egitim koclugu'],
                    required_intake_fields: ['Butce', 'Hedef konu', 'Iletisim tercihleri']
                },
                scenarios: Array.from({ length: 6 }).map((_, index) => ({
                    id: `S${index + 1}`,
                    title: `Senaryo ${index + 1}`,
                    goal: 'Lead qualification',
                    customer_profile: 'Veli',
                    lead_temperature: index % 2 === 0 ? 'hot' : 'warm',
                    information_sharing: 'cooperative',
                    turns: [
                        { customer: 'Fiyat ve uygunluk bilgisi istiyorum.' },
                        { customer: 'Butcem kisitli, ne onerirsiniz?' },
                        { customer: 'Hizli baslamak istiyorum.' }
                    ]
                }))
            },
            {
                fixture_min_lines: 30,
                scenario_count: 6
            } as unknown as Parameters<typeof stabilizeGeneratorOutputForQuality>[1]
        )

        const qualityError = validateGeneratorOutputQuality(
            stabilized,
            {
                fixture_min_lines: 30,
                scenario_count: 6
            } as unknown as Parameters<typeof validateGeneratorOutputQuality>[1]
        )

        expect(stabilized.kb_fixture.lines.length).toBe(30)
        expect(qualityError).toBeNull()
    })

    it('normalizes contact-preference required field into callback-time requirement', () => {
        const normalized = normalizeRequiredIntakeFieldsForQaLab([
            'Isletme Buyuklugu',
            'Iletisim Tercihleri',
            'Butce',
            'Acil Durum'
        ])

        expect(normalized).toContain('Uygun geri dönüş zaman aralığı')
        expect(normalized).toContain('Proje aciliyet seviyesi')
        expect(normalized).not.toContain('Iletisim Tercihleri')
        expect(normalized).not.toContain('Acil Durum')
    })

    it('uses empty per-scenario required fields for policy/procedure scenarios (sector-agnostic)', () => {
        const resolved = resolveQaLabScenarioRequiredIntakeFields({
            scenario: {
                id: 'scenario_policy',
                title: 'İptal Prosedürü',
                goal: 'İptal prosedürü hakkında bilgi almak',
                customer_profile: 'Müşteri',
                lead_temperature: 'cold',
                information_sharing: 'resistant',
                turns: [
                    { customer: 'İptal için kaç saat önce bildirim yapmalıyım?' }
                ]
            },
            generated: {
                kb_fixture: {
                    title: 'Örnek',
                    lines: ['Ders iptali 24 saat önce bildirilmelidir.']
                },
                derived_setup: {
                    offering_profile_summary: 'Örnek işletme',
                    service_catalog: ['Hizmet'],
                    required_intake_fields: ['Öğrencinin yaşı', 'Bütçe']
                },
                ground_truth: {
                    canonical_services: ['Hizmet'],
                    required_intake_fields: ['Öğrencinin yaşı', 'Bütçe'],
                    critical_policy_facts: ['Ders iptali 24 saat önce bildirilmelidir.'],
                    disallowed_fabricated_claims: []
                },
                scenarios: []
            } as unknown as Parameters<typeof resolveQaLabScenarioRequiredIntakeFields>[0]['generated'],
            defaultRequiredFields: ['Öğrencinin yaşı', 'Bütçe', 'Zaman dilimi']
        })

        expect(resolved.requestMode).toBe('policy_or_procedure')
        expect(resolved.requiredFields).toEqual([])
    })

    it('uses empty per-scenario required fields for explicit general-information scenarios', () => {
        const defaultRequiredFields = ['Bütçe', 'Zaman dilimi', 'İhtiyaç duyulan hizmet']
        const resolved = resolveQaLabScenarioRequiredIntakeFields({
            scenario: {
                id: 'scenario_general_info',
                title: 'Veteriner Hizmetleri Hakkında Genel Bilgi',
                goal: 'Klinik hizmetleri hakkında genel bilgi almak',
                customer_profile: 'Detay vermek istemeyen müşteri',
                lead_temperature: 'cold',
                information_sharing: 'resistant',
                turns: [
                    { customer: 'Verebileceğiniz hizmetler hakkında genel bilgi almak istiyorum.' }
                ]
            },
            generated: {
                kb_fixture: { title: 'Örnek', lines: ['Genel muayene ve aşılama hizmetleri sunulur.'] },
                derived_setup: {
                    offering_profile_summary: 'Örnek işletme',
                    service_catalog: ['Genel muayene', 'Aşılama'],
                    required_intake_fields: defaultRequiredFields
                },
                ground_truth: {
                    canonical_services: ['Genel muayene', 'Aşılama'],
                    required_intake_fields: defaultRequiredFields,
                    critical_policy_facts: [],
                    disallowed_fabricated_claims: []
                },
                scenarios: []
            } as unknown as Parameters<typeof resolveQaLabScenarioRequiredIntakeFields>[0]['generated'],
            defaultRequiredFields
        })

        expect(resolved.requestMode).toBe('general_information')
        expect(resolved.requiredFields).toEqual([])
    })

    it('keeps default per-scenario required fields for lead qualification scenarios', () => {
        const defaultRequiredFields = ['Bütçe', 'Zaman dilimi', 'İhtiyaç duyulan hizmet']
        const resolved = resolveQaLabScenarioRequiredIntakeFields({
            scenario: {
                id: 'scenario_qual',
                title: 'Fiyat ve Uygunluk',
                goal: 'Fiyat ve uygunluk hakkında bilgi almak',
                customer_profile: 'Müşteri',
                lead_temperature: 'warm',
                information_sharing: 'partial',
                turns: [
                    { customer: 'Fiyat aralığınız nedir, bu hafta başlayabilir miyiz?' }
                ]
            },
            generated: {
                kb_fixture: { title: 'Örnek', lines: ['Fiyatlar kapsama göre değişir.'] },
                derived_setup: {
                    offering_profile_summary: 'Örnek işletme',
                    service_catalog: ['Hizmet'],
                    required_intake_fields: defaultRequiredFields
                },
                ground_truth: {
                    canonical_services: ['Hizmet'],
                    required_intake_fields: defaultRequiredFields,
                    critical_policy_facts: ['İlk görüşme ücretsizdir.'],
                    disallowed_fabricated_claims: []
                },
                scenarios: []
            } as unknown as Parameters<typeof resolveQaLabScenarioRequiredIntakeFields>[0]['generated'],
            defaultRequiredFields
        })

        expect(resolved.requestMode).toBe('lead_qualification')
        expect(resolved.requiredFields).toEqual(defaultRequiredFields)
    })

    it('promotes scenario mode from general-information to lead-qualification when turn intent becomes actionable', () => {
        const promoted = promoteQaLabScenarioRequestMode({
            currentMode: 'general_information',
            currentRequiredFields: [],
            defaultRequiredFields: ['Bütçe', 'Hizmet Detayları', 'Zaman Çizelgesi'],
            scenarioTitle: 'Hizmet Hakkında Genel Bilgi',
            scenarioGoal: 'Hizmetler hakkında bilgi almak',
            customerMessage: 'Fiyatlarınız nedir ve bu hafta randevu alabilir miyim?',
            generated: {
                kb_fixture: { title: 'Örnek', lines: ['Fiyatlar kapsama göre değişir.'] },
                derived_setup: {
                    offering_profile_summary: 'Örnek işletme',
                    service_catalog: ['Hizmet'],
                    required_intake_fields: ['Bütçe', 'Hizmet Detayları', 'Zaman Çizelgesi']
                },
                ground_truth: {
                    canonical_services: ['Hizmet'],
                    required_intake_fields: ['Bütçe', 'Hizmet Detayları', 'Zaman Çizelgesi'],
                    critical_policy_facts: [],
                    disallowed_fabricated_claims: []
                },
                scenarios: []
            } as unknown as Parameters<typeof promoteQaLabScenarioRequestMode>[0]['generated']
        })

        expect(promoted.requestMode).toBe('lead_qualification')
        expect(promoted.requiredFields).toEqual(['Bütçe', 'Hizmet Detayları', 'Zaman Çizelgesi'])
    })

    it('drops callback-time requirement when timeline field already exists', () => {
        const normalized = normalizeRequiredIntakeFieldsForQaLab([
            'Proje Zaman Çizelgesi',
            'Geri Dönüş Zaman Aralığı',
            'Proje Bütçesi'
        ])

        expect(normalized).toContain('Proje Zaman Çizelgesi')
        expect(normalized).toContain('Proje Bütçesi')
        expect(normalized).not.toContain('Geri Dönüş Zaman Aralığı')
    })

    it('supplements customer turn with required-field answer when previous assistant asks it', () => {
        const adapted = adaptQaLabCustomerTurnToAssistantContext({
            message: 'Bütçemiz aylık 1000 TL civarında. Hangi seçenekler var?',
            previousAssistantMessage: 'Çocuğunuzun yaşı nedir?',
            requiredFields: ['Öğrenci Yaşı', 'Bütçe'],
            informationSharing: 'cooperative'
        })

        expect(adapted).toContain('Öğrenci 12 yaşında.')
        expect(adapted).toContain('Bütçemiz aylık 1000 TL civarında.')
    })

    it('adds context-following answer when assistant asks a clarifying question outside required fields', () => {
        const adapted = adaptQaLabCustomerTurnToAssistantContext({
            message: 'Paketler hakkında da bilgi alabilir miyim?',
            previousAssistantMessage: 'Hafta içi hangi saatler sizin için daha uygun olur?',
            requiredFields: ['Bütçe', 'Hizmet Kapsamı'],
            informationSharing: 'partial'
        })

        expect(adapted).toContain('Zamanlamamız esnek, net tarihi kısa süre içinde netleştirebiliriz.')
        expect(adapted).toContain('Paketler hakkında da bilgi alabilir miyim?')
    })

    it('uses service catalog context when supplementing service-detail answers', () => {
        const adapted = adaptQaLabCustomerTurnToAssistantContext({
            message: 'Detayları karşılaştırmak istiyorum.',
            previousAssistantMessage: 'Hangi hizmete odaklanmak istiyorsunuz?',
            requiredFields: ['Hizmet Detayları'],
            informationSharing: 'cooperative',
            serviceCatalog: ['Web Geliştirme', 'Mobil Uygulama Geliştirme']
        })

        expect(adapted).toContain('Web Geliştirme ve Mobil Uygulama Geliştirme odaklı bir çözüm arıyoruz.')
    })

    it('supplements service detail when assistant asks with domain-specific wording', () => {
        const adapted = adaptQaLabCustomerTurnToAssistantContext({
            message: 'Ne zaman başlayabiliriz?',
            previousAssistantMessage: 'Örneğin, web geliştirme, mobil uygulama geliştirme veya başka bir alan mı?',
            requiredFields: ['Hizmet Detayları', 'Proje Bütçesi'],
            informationSharing: 'cooperative',
            serviceCatalog: ['Web Geliştirme', 'Mobil Uygulama Geliştirme']
        })

        expect(adapted).toContain('Web Geliştirme ve Mobil Uygulama Geliştirme odaklı bir çözüm arıyoruz.')
        expect(adapted).toContain('Ne zaman başlayabiliriz?')
    })

    it('prevents contradictory budget injection when previous question is not about budget', () => {
        const adapted = adaptQaLabCustomerTurnToAssistantContext({
            message: 'Bütçemiz aylık yaklaşık 1000 TL civarında. Ne zaman başlayabiliriz?',
            previousAssistantMessage: 'Hangi hizmete odaklanmak istiyorsunuz?',
            requiredFields: ['Hizmet Detayları', 'Proje Bütçesi'],
            informationSharing: 'partial',
            history: [
                {
                    role: 'user',
                    content: 'Bütçemiz 20.000 TL civarında.'
                }
            ],
            serviceCatalog: ['Web Geliştirme']
        })

        expect(adapted).not.toContain('1000 TL')
        expect(adapted).toContain('Ne zaman başlayabiliriz?')
    })

    it('keeps user message unchanged when it already answers assistant clarification', () => {
        const original = 'Bütçemiz 3500 TL civarında.'
        const adapted = adaptQaLabCustomerTurnToAssistantContext({
            message: original,
            previousAssistantMessage: 'Bütçe aralığınızı paylaşabilir misiniz?',
            requiredFields: ['Bütçe'],
            informationSharing: 'cooperative'
        })

        expect(adapted).toBe(original)
    })

    it('uses a single boundary statement for resistant customer context', () => {
        const adapted = adaptQaLabCustomerTurnToAssistantContext({
            message: 'Önce genel hizmet kapsamını öğrenmek istiyorum.',
            previousAssistantMessage: 'İşletmenizde yaklaşık kaç çalışan var?',
            requiredFields: [],
            informationSharing: 'resistant'
        })

        expect(adapted).toContain('Bu detayı şu an paylaşmak istemiyorum.')
        expect(adapted).toContain('Önce genel hizmet kapsamını öğrenmek istiyorum.')
    })

    it('replaces generic continuation prompts with aligned field answer when assistant asked a specific field', () => {
        const adapted = adaptQaLabCustomerTurnToAssistantContext({
            message: 'Detay sorusu 4: Bu konuda biraz daha bilgi verebilir misiniz?',
            previousAssistantMessage: 'Öncelik seviyenizi paylaşabilir misiniz (yüksek / orta / düşük)?',
            requiredFields: ['Proje aciliyet seviyesi'],
            informationSharing: 'partial'
        })

        expect(adapted).toContain('Aciliyet orta seviyede')
        expect(adapted).not.toContain('Detay sorusu 4')
    })

    it('removes blocked intake re-ask questions from assistant response', () => {
        const sanitized = stripBlockedFieldQuestionsFromAssistantResponse({
            response: 'Bütçe bilgisi netleşti. Çocuğunuzun yaşı nedir? Devam etmek için kapsamı da paylaşabilir misiniz?',
            blockedFields: ['Öğrenci Yaşı']
        })

        expect(sanitized).toContain('Bütçe bilgisi netleşti.')
        expect(sanitized).toContain('kapsamı da paylaşabilir misiniz?')
        expect(sanitized).not.toContain('Çocuğunuzun yaşı nedir?')
    })

    it('keeps non-blocked questions intact when filtering response', () => {
        const unchanged = stripBlockedFieldQuestionsFromAssistantResponse({
            response: 'Harika. Randevu için uygun saat aralığınız nedir?',
            blockedFields: ['Bütçe']
        })

        expect(unchanged).toBe('Harika. Randevu için uygun saat aralığınız nedir?')
    })

    it('removes engagement question when user asks to stop contact', () => {
        const sanitized = stripEngagementQuestionsAfterStopContact({
            response: 'Anladım, iletişim kurmayacağım. Başka bir konuda yardımcı olabilir miyim?',
            userMessage: 'Bir daha aramayın lütfen.'
        })

        expect(sanitized).toContain('Anladım, iletişim kurmayacağım.')
        expect(sanitized).not.toContain('Başka bir konuda yardımcı olabilir miyim?')
    })

    it('returns stop-contact acknowledgement when engagement question is the only chunk', () => {
        const sanitized = stripEngagementQuestionsAfterStopContact({
            response: 'Başka bir konuda yardımcı olabilir miyim?',
            userMessage: 'Lütfen bir daha yazmayın.'
        })

        expect(sanitized).toBe('Talebinizi aldım, iletişimi burada durduruyorum.')
    })

    it('replaces website-phone redirect guidance with chat-first continuation', () => {
        const sanitized = sanitizeExternalContactRedirectResponse({
            response: 'Randevu almak için web sitemizi ziyaret edebilir veya telefonla iletişime geçebilirsiniz.',
            responseLanguage: 'tr',
            requestMode: 'lead_qualification',
            userMessage: 'Bu hafta uygunluk var mı?',
            activeMissingFields: ['Zaman Çizelgesi']
        })

        expect(sanitized).toContain('Buradan devam edebiliriz.')
        expect(sanitized).toContain('Uygun zamanlama aralığınızı paylaşabilir misiniz?')
        expect(sanitized).not.toContain('web sitemizi')
        expect(sanitized).not.toContain('telefonla')
    })

    it('strips intake questions in non-qualification request modes', () => {
        const sanitized = stripIntakeQuestionsForNonQualificationMode({
            response: 'Elbette genel bilgi verebilirim. Bütçe aralığınızı paylaşabilir misiniz?',
            requestMode: 'general_information',
            requiredFields: ['Bütçe', 'Zamanlama']
        })

        expect(sanitized).toContain('Elbette genel bilgi verebilirim.')
        expect(sanitized).not.toContain('Bütçe aralığınızı paylaşabilir misiniz?')
    })

    it('returns neutral overview fallback when non-qualification response only contains intake question', () => {
        const sanitized = stripIntakeQuestionsForNonQualificationMode({
            response: 'Bütçe aralığınızı paylaşabilir misiniz?',
            requestMode: 'policy_or_procedure',
            requiredFields: ['Bütçe'],
            responseLanguage: 'tr'
        })

        expect(sanitized).toBe('Mevcut bilgilerle kısa bir genel çerçeve paylaşabilirim.')
    })

    it('strips intake questions when user refuses to share details in current turn', () => {
        const sanitized = stripIntakeQuestionsAfterRefusal({
            response: 'Anladım. Çekim tarihini paylaşabilir misiniz?',
            userMessage: 'Bu detayı paylaşmak istemiyorum.',
            requiredFields: ['Çekim Tarihi']
        })

        expect(sanitized).toContain('Anladım.')
        expect(sanitized).not.toContain('Çekim tarihini paylaşabilir misiniz?')
    })

    it('returns refusal-safe fallback when refusal-turn response only contains intake question', () => {
        const sanitized = stripIntakeQuestionsAfterRefusal({
            response: 'Çekim tarihini paylaşabilir misiniz?',
            userMessage: 'Bu bilgiyi paylaşmak istemiyorum.',
            requiredFields: ['Çekim Tarihi'],
            responseLanguage: 'tr'
        })

        expect(sanitized).toBe('Anladım. Mevcut bilgilerle devam edebiliriz.')
    })

    it('moves concrete answer chunk before intake question for direct user questions', () => {
        const reordered = moveAnswerChunkFirstForDirectQuestion({
            response: 'Bütçe aralığınızı paylaşabilir misiniz? Fiyatlar hizmet türüne ve kapsama göre değişir.',
            userMessage: 'Fiyatlarınız nasıl?'
        })

        expect(reordered.startsWith('Fiyatlar hizmet türüne ve kapsama göre değişir.')).toBe(true)
        expect(reordered).toContain('Bütçe aralığınızı paylaşabilir misiniz?')
    })

    it('adds detail and next-step when response is low-information for direct question', () => {
        const enriched = enrichAssistantResponseWhenLowInformation({
            response: 'Fiyatlar kapsamına göre değişir.',
            userMessage: 'Ne zaman başlayabilirsiniz?',
            responseLanguage: 'tr',
            requestMode: 'lead_qualification',
            activeMissingFields: ['Proje aciliyet seviyesi'],
            kbContextLines: ['Başlangıç süreleri yoğunluğa göre genellikle 1-2 hafta içinde planlanır.'],
            fallbackTopics: ['başlangıç planı', 'hizmet kapsamı']
        })

        expect(enriched).toContain('Ek bilgi:')
        expect(enriched).toContain('Öncelik seviyenizi paylaşabilir misiniz')
    })

    it('enforces critical service/urgency follow-up by turn 3 in hot cooperative flow', () => {
        const enforced = ensureHotCooperativeCriticalFieldQuestion({
            response: 'Planı netleştirebiliriz. Uygun zamanlama aralığınızı paylaşabilir misiniz?',
            scenarioContext: {
                leadTemperature: 'hot',
                informationSharing: 'cooperative',
                turnIndex: 3
            },
            activeMissingFields: ['Hizmet detayları', 'Proje aciliyet seviyesi']
        })

        expect(enforced).toContain('Öncelik seviyenizi paylaşabilir misiniz')
        expect(enforced).not.toContain('Uygun zamanlama aralığınızı paylaşabilir misiniz?')
    })

    it('enriches first general-information response with pricing and start-planning baseline', () => {
        const enriched = enforceGeneralInformationBaselineResponse({
            response: 'Merhaba, genel olarak yardımcı olabilirim.',
            responseLanguage: 'tr',
            requestMode: 'general_information',
            history: [],
            fallbackTopics: ['iç mekan tadilatı', 'elektrik işleri']
        })

        expect(enriched).toContain('Fiyatlandırma, kapsam ve iş yüküne göre netleşir.')
        expect(enriched).toContain('Başlangıç planı')
    })

    it('flags no-progress stall after two consecutive non-progress lead-qualification turns', () => {
        const shouldUseFallback = shouldUseNoProgressNextStepResponse({
            history: [
                { role: 'user', content: 'Fiyat bilgisi alabilir miyim?' },
                { role: 'assistant', content: 'Elbette, bütçe aralığınızı paylaşabilir misiniz?' },
                { role: 'user', content: 'Bu detayı paylaşmak istemiyorum.' },
                { role: 'assistant', content: 'Anladım, yine de bütçe aralığınız nedir?' }
            ],
            currentUserMessage: 'Şu an söylemek istemiyorum.',
            requestMode: 'lead_qualification',
            requiredFields: ['Bütçe'],
            activeMissingFields: ['Bütçe']
        })

        expect(shouldUseFallback).toBe(true)
    })

    it('does not trigger no-progress stall guard outside lead-qualification mode', () => {
        const shouldUseFallback = shouldUseNoProgressNextStepResponse({
            history: [
                { role: 'user', content: 'Genel bilgi alabilir miyim?' },
                { role: 'assistant', content: 'Tabii, genel hizmetleri paylaşabilirim.' }
            ],
            currentUserMessage: 'Detay vermek istemiyorum.',
            requestMode: 'general_information',
            requiredFields: ['Bütçe'],
            activeMissingFields: ['Bütçe']
        })

        expect(shouldUseFallback).toBe(false)
    })

    it('replaces generic clarification questions with field-named follow-up', () => {
        const refined = enforceFieldNamedClarificationQuestion({
            response: 'Harika, devam edelim. Bu bilgiyi paylaşabilir misiniz?',
            activeMissingFields: ['Öğrenci Yaşı']
        })

        expect(refined).toContain('İlgili kişinin yaş aralığını paylaşabilir misiniz?')
        expect(refined).not.toContain('Bu bilgiyi paylaşabilir misiniz?')
    })

    it('keeps assistant response unchanged when question already names a missing field', () => {
        const unchanged = enforceFieldNamedClarificationQuestion({
            response: 'Harika. Bütçe aralığınızı paylaşabilir misiniz?',
            activeMissingFields: ['Bütçe']
        })

        expect(unchanged).toBe('Harika. Bütçe aralığınızı paylaşabilir misiniz?')
    })

    it('appends one explicit active missing-field question when none exists', () => {
        const patched = ensureActiveMissingFieldQuestion({
            response: 'Süreç adımlarını özetleyebilirim.',
            activeMissingFields: ['Proje aciliyet seviyesi'],
            userMessage: 'Önce süreci öğrenmek istiyorum.'
        })

        expect(patched).toContain('Öncelik seviyenizi paylaşabilir misiniz (yüksek / orta / düşük)?')
    })

    it('does not append missing-field question when user explicitly refuses sharing', () => {
        const unchanged = ensureActiveMissingFieldQuestion({
            response: 'Anladım, mevcut bilgilerle devam edebiliriz.',
            activeMissingFields: ['Proje aciliyet seviyesi'],
            userMessage: 'Bu detayı paylaşmak istemiyorum.'
        })

        expect(unchanged).toBe('Anladım, mevcut bilgilerle devam edebiliriz.')
    })

    it('does not append missing-field question when intake follow-up is disabled for current turn mode', () => {
        const unchanged = ensureActiveMissingFieldQuestion({
            response: 'İptal prosedürünü özetleyebilirim.',
            activeMissingFields: ['Bütçe'],
            userMessage: 'İptal için kaç saat önce bildirim yapmalıyım?',
            allowAppend: false
        })

        expect(unchanged).toBe('İptal prosedürünü özetleyebilirim.')
    })

    it('removes likely truncated numbered-list tails from assistant response', () => {
        const sanitized = sanitizeAssistantResponseForTruncation(
            'Hizmetlerimiz: 1. Web geliştirme 2. Mobil geliştirme 3. Danışmanlık 4. Proje yönetimi 5. Bakım 6.'
        )

        expect(sanitized.endsWith('6.')).toBe(false)
        expect(sanitized).toContain('Detayları ihtiyacınıza göre netleştirebiliriz.')
    })

    it('rewrites generic unknown response into actionable lead-qualification response', () => {
        const refined = refineQaLabGenericUnknownResponse({
            response: 'Bu konuda net bilgi bulamadım. Biraz daha detay paylaşır mısınız?',
            responseLanguage: 'tr',
            requestMode: 'lead_qualification',
            userMessage: 'Ne zaman başlayabiliriz?',
            activeMissingFields: ['Hizmet Detayları'],
            fallbackTopics: ['hizmet kapsamı', 'zamanlama']
        })

        expect(refined).toContain('Bu konuda kesin bir detay paylaşamıyorum.')
        expect(refined).toContain('İhtiyaç duyduğunuz hizmet veya konuyu netleştirebilir misiniz?')
    })

    it('avoids pressure question when user explicitly refuses detail sharing', () => {
        const refined = refineQaLabGenericUnknownResponse({
            response: 'Bu konuda net bilgi bulamadım. Biraz daha detay paylaşır mısınız?',
            responseLanguage: 'tr',
            requestMode: 'lead_qualification',
            userMessage: 'Bu detayı paylaşmak istemiyorum.',
            activeMissingFields: ['Hizmet Detayları'],
            fallbackTopics: ['hizmet kapsamı', 'zamanlama']
        })

        expect(refined).toContain('kesin bir detay paylaşamıyorum')
        expect(refined).toContain('hizmet kapsamı veya zamanlama')
        expect(refined).not.toContain('netleştirebilir misiniz?')
    })

    it('drops findings when cited scenario attributes conflict with finding rationale', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'major',
                    violated_rule: 'Missing key intake questions in hot scenarios',
                    evidence: '[scenario_id=scenario_2, turn=1]',
                    rationale: 'In hot scenarios, intake fields were missed.',
                    suggested_fix: 'Ask required fields.',
                    target_layer: 'pipeline',
                    effort: 'medium',
                    confidence: 0.8
                },
                {
                    severity: 'minor',
                    violated_rule: 'Re-asking already provided intake details',
                    evidence: '[scenario_id=scenario_1, turn=3]',
                    rationale: 'Repeated budget question disrupted flow.',
                    suggested_fix: 'Track collected fields.',
                    target_layer: 'pipeline',
                    effort: 'low',
                    confidence: 0.7
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Hot scenario',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'hot',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Bütçemiz 5000 TL civarında.',
                            assistant_response: 'Teşekkürler, not aldım.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Bu hafta başlayabiliriz.',
                            assistant_response: 'Bütçe aralığınızı paylaşabilir misiniz?',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        },
                        {
                            turn_index: 3,
                            customer_message: 'Fiyatı netleştirelim.',
                            assistant_response: 'Bütçe aralığınızı tekrar paylaşabilir misiniz?',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        }
                    ]
                },
                {
                    case_id: 'scenario_2',
                    title: 'Warm scenario',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'x', assistant_response: 'y', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ]
        })

        expect(filtered).toHaveLength(1)
        expect(filtered[0]?.violated_rule).toBe('Re-asking already provided intake details')
    })

    it('drops repetitive-question findings when cited turn does not actually re-ask provided data', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'minor',
                    violated_rule: 'Re-asking already provided intake details',
                    evidence: '[scenario_id=scenario_1, turn=2]',
                    rationale: 'Assistant repeated budget question after the customer had already shared it.',
                    suggested_fix: 'Track collected fields.',
                    target_layer: 'pipeline',
                    effort: 'low',
                    confidence: 0.7
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Scenario 1',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Uygunluk ve hizmet detaylarını merak ediyorum.',
                            assistant_response: 'Zamanlama ve kapsamı konuşabiliriz.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Bu hafta içi müsaitlik bakıyorum.',
                            assistant_response: 'Bütçe aralığınızı paylaşabilir misiniz?',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        }
                    ]
                }
            ]
        })

        expect(filtered).toHaveLength(0)
    })

    it('drops repetitive-question findings when cited turn asks a different field category', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'minor',
                    violated_rule: 'Repetitive questioning without progression',
                    evidence: '[scenario_id=scenario_1, turn=3]',
                    rationale: 'Assistant repeated budget questioning after the customer had already provided budget.',
                    suggested_fix: 'Do not re-ask the same field.',
                    target_layer: 'pipeline',
                    effort: 'low',
                    confidence: 0.7
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Scenario 1',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Bütçem 10.000 TL civarında.',
                            assistant_response: 'Bütçeyi not aldım, teşekkürler.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Hafta içi ilerleyebiliriz.',
                            assistant_response: 'Zamanlama aralığınızı paylaşabilir misiniz?',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        },
                        {
                            turn_index: 3,
                            customer_message: 'Çarşamba olabilir.',
                            assistant_response: 'İhtiyaç duyduğunuz hizmet veya konuyu netleştirebilir misiniz?',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        }
                    ]
                }
            ]
        })

        expect(filtered).toHaveLength(0)
    })

    it('drops missing-field findings when cited cases have no matching missing field in intake coverage', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'major',
                    violated_rule: 'Missing required intake fields in warm scenarios',
                    evidence: '[scenario_id=scenario_1, turn=2]',
                    rationale: 'Assistant failed to collect age information.',
                    suggested_fix: 'Ask the age field.',
                    target_layer: 'pipeline',
                    effort: 'medium',
                    confidence: 0.8
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Warm coaching',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Merhaba', assistant_response: 'Yaş bilgisi alabilir miyim?', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Yaş bilgisini şu an paylaşmak istemiyorum.', assistant_response: 'Anladım, seans süresi 1 saattir.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_1',
                    missingFields: []
                }
            ]
        })

        expect(filtered).toHaveLength(0)
    })

    it('drops missing-field findings when quoted field name contradicts cited case coverage', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'major',
                    violated_rule: 'Missing required intake fields in hot scenarios',
                    evidence: '[scenario_id=scenario_1, turn=2]',
                    rationale: "Assistant failed to collect 'Hayvan türü'.",
                    suggested_fix: "Collect 'Hayvan türü' before handoff.",
                    target_layer: 'pipeline',
                    effort: 'medium',
                    confidence: 0.8
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Veteriner vaka',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'hot',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Merhaba, köpeğim için bilgi almak istiyorum.', assistant_response: 'Bütçe paylaşır mısınız?', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Bütçem 10.000 TL civarı.', assistant_response: 'Anladım.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_1',
                    missingFields: ['Proje aciliyet seviyesi']
                }
            ]
        })

        expect(filtered).toHaveLength(0)
    })

    it('drops did-not-ask findings when assistant already asked the cited field before or at cited turn', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'major',
                    violated_rule: 'Missing required intake fields in hot scenarios',
                    evidence: '[scenario_id=scenario_1, turn=3]',
                    rationale: 'Assistant failed to ask for urgency level.',
                    suggested_fix: 'Ask urgency level explicitly.',
                    target_layer: 'pipeline',
                    effort: 'medium',
                    confidence: 0.8
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Hot case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'hot',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Merhaba', assistant_response: 'Nasıl yardımcı olabilirim?', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Fiyat bilgisi alabilir miyim?', assistant_response: 'Bütçe aralığınızı paylaşır mısınız?', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 3, customer_message: 'Bütçem 8000 TL civarında.', assistant_response: 'Öncelik seviyenizi paylaşabilir misiniz (yüksek / orta / düşük)?', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_1',
                    missingFields: ['Proje aciliyet seviyesi']
                }
            ]
        })

        expect(filtered).toHaveLength(0)
    })

    it('drops generic missing-intake findings when cited case already has sufficient intake progress', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'major',
                    violated_rule: 'intake-fulfillment',
                    evidence: '[scenario_id=scenario_9, turn=3]',
                    rationale: 'The assistant did not attempt to collect any required intake fields.',
                    suggested_fix: 'Ask for required fields.',
                    target_layer: 'pipeline',
                    effort: 'medium',
                    confidence: 0.7
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_9',
                    title: 'General information case',
                    goal: 'Hizmetler hakkında genel bilgi almak.',
                    customer_profile: 'Resistant customer',
                    lead_temperature: 'cold',
                    information_sharing: 'resistant',
                    request_mode: 'general_information',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Merhaba, hizmetleriniz hakkında bilgi alabilir miyim?', assistant_response: 'Elbette, temel hizmetlerimizi paylaşabilirim.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Detay vermek istemiyorum.', assistant_response: 'Sorun değil, temel çerçevede ilerleyebiliriz.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 3, customer_message: 'Sadece genel bilgi yeterli.', assistant_response: 'Düğün ve nişan çekimi gibi hizmetler sunuyoruz.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_9',
                    handoffReadiness: 'pass',
                    askedCoverage: 0.5,
                    fulfillmentCoverage: 0.5,
                    missingFields: ['Çekim Tarihi', 'Çekim Yeri']
                }
            ]
        })

        expect(filtered).toHaveLength(0)
    })

    it('flags suspiciously low judge score for strict-score retry when intake quality is healthy', () => {
        const shouldRetry = shouldRetryJudgeForScoreAnomaly({
            judgeResult: {
                summary: 'Assistant generally performs well with a few gaps.',
                score_breakdown: {
                    groundedness: 1,
                    extraction_accuracy: 1,
                    conversation_quality: 1,
                    weighted_total: 1
                },
                findings: [
                    {
                        severity: 'major',
                        violated_rule: 'example_rule',
                        evidence: '[scenario_id=scenario_1, turn=1]',
                        rationale: 'example',
                        suggested_fix: 'example',
                        target_layer: 'pipeline',
                        effort: 'medium',
                        confidence: 0.7
                    }
                ],
                top_actions: [],
                scenario_assessments: []
            },
            intakeCoverageTotals: {
                caseCount: 20,
                readyCaseCount: 17,
                averageFulfillmentCoverage: 0.82
            }
        })

        expect(shouldRetry).toBe(true)
    })

    it('does not trigger strict-score retry when intake quality is weak', () => {
        const shouldRetry = shouldRetryJudgeForScoreAnomaly({
            judgeResult: {
                summary: 'Conversation quality is weak.',
                score_breakdown: {
                    groundedness: 1,
                    extraction_accuracy: 1,
                    conversation_quality: 1,
                    weighted_total: 1
                },
                findings: [],
                top_actions: [],
                scenario_assessments: []
            },
            intakeCoverageTotals: {
                caseCount: 20,
                readyCaseCount: 4,
                averageFulfillmentCoverage: 0.25
            }
        })

        expect(shouldRetry).toBe(false)
    })

    it('scales judge output token target with scenario count and clamps to max cap', () => {
        const low = calculateJudgeTargetOutputTokens(4)
        const quick = calculateJudgeTargetOutputTokens(20)
        const regression = calculateJudgeTargetOutputTokens(36)
        const capped = calculateJudgeTargetOutputTokens(200)

        expect(low).toBe(1240)
        expect(quick).toBe(2600)
        expect(regression).toBe(3960)
        expect(capped).toBe(5200)
        expect(low).toBeLessThan(quick)
        expect(quick).toBeLessThan(regression)
    })

    it('keeps judge-provided scenario assessments and fills missing cases with fallback', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_1',
                    assistant_success: 'pass',
                    answer_quality_score: 88,
                    logic_score: 85,
                    groundedness_score: 92,
                    summary: 'Coherent and grounded responses.',
                    strengths: ['Intent-following'],
                    issues: ['Minor verbosity'],
                    confidence: 0.82
                },
                {
                    case_id: 'unknown_case',
                    assistant_success: 'fail'
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Scenario 1',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'hot',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'x', assistant_response: 'y', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                },
                {
                    case_id: 'scenario_2',
                    title: 'Scenario 2',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'x', assistant_response: 'y', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_2',
                    handoffReadiness: 'warn',
                    fulfillmentCoverage: 0.5
                }
            ]
        })

        expect(assessments).toHaveLength(2)
        expect(assessments[0]).toMatchObject({
            case_id: 'scenario_1',
            assistant_success: 'pass',
            source: 'judge'
        })

        const fallback = assessments.find((item) => item.case_id === 'scenario_2')
        expect(fallback).toMatchObject({
            case_id: 'scenario_2',
            assistant_success: 'warn',
            source: 'fallback'
        })
        expect((fallback?.summary ?? '').toLowerCase()).toContain('fallback')
    })

    it('clamps invalid per-scenario scores and confidence into valid ranges', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_1',
                    assistant_success: 'unknown',
                    answer_quality_score: 120,
                    logic_score: -5,
                    groundedness_score: 'not-a-number',
                    confidence: 2
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Scenario 1',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'x', assistant_response: 'y', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: []
        })

        expect(assessments[0]).toMatchObject({
            case_id: 'scenario_1',
            assistant_success: 'warn',
            answer_quality_score: 100,
            logic_score: 0,
            groundedness_score: 0,
            confidence: 1
        })
    })

    it('downgrades strict fail to warn for cold-resistant scenarios with mostly sufficient intake coverage', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_1',
                    assistant_success: 'fail',
                    answer_quality_score: 55,
                    logic_score: 50,
                    groundedness_score: 70,
                    summary: 'Failed due to one missing field.',
                    strengths: ['Basic service info provided'],
                    issues: ['Missing one intake field'],
                    confidence: 0.75
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Cold resistant case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'cold',
                    information_sharing: 'resistant',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Detay vermek istemiyorum.', assistant_response: 'Temel bilgi verebilirim.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Bütçem 4000 TL.', assistant_response: 'Teşekkürler, not aldım.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_1',
                    handoffReadiness: 'pass',
                    askedCoverage: 0.75,
                    fulfillmentCoverage: 0.75
                }
            ]
        })

        expect(assessments[0]?.assistant_success).toBe('warn')
    })

    it('downgrades scenario success when assistant gives low-information placeholder response', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_1',
                    assistant_success: 'pass',
                    answer_quality_score: 86,
                    logic_score: 84,
                    groundedness_score: 82,
                    summary: 'Provided relevant response.',
                    strengths: ['Clear tone'],
                    issues: [],
                    confidence: 0.8
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Low-info response case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Önceliği belirlemek için sizce hangi bilgi daha kritik?',
                            assistant_response: 'Bu, hızlı bir müdahale planı oluşturmak için önemlidir.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_1',
                    handoffReadiness: 'pass',
                    askedCoverage: 1,
                    fulfillmentCoverage: 1,
                    missingFields: []
                }
            ]
        })

        expect(assessments[0]?.assistant_success).toBe('warn')
        expect((assessments[0]?.summary ?? '').toLowerCase()).toContain('low-information')
        expect(assessments[0]?.issues.some((issue) => issue.toLowerCase().includes('low-information'))).toBe(true)
        expect((assessments[0]?.answer_quality_score ?? 0)).toBeLessThan(86)
    })

    it('removes false missing-field issues from scenario assessments when intake coverage shows no missing field', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_1',
                    assistant_success: 'warn',
                    answer_quality_score: 78,
                    logic_score: 75,
                    groundedness_score: 85,
                    summary: 'Missed critical age information, but provided useful context.',
                    strengths: ['Good context'],
                    issues: ['Failed to collect age information.'],
                    confidence: 0.7
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Warm case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'x', assistant_response: 'y', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_1',
                    handoffReadiness: 'pass',
                    askedCoverage: 1,
                    fulfillmentCoverage: 1,
                    missingFields: []
                }
            ]
        })

        expect(assessments[0]?.issues).toEqual([])
        expect(assessments[0]?.assistant_success).toBe('pass')
        expect((assessments[0]?.summary ?? '').toLowerCase()).toContain('consistency')
    })

    it('clears did-not-ask style scenario issues when transcript shows the assistant already asked the field', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_6',
                    assistant_success: 'warn',
                    answer_quality_score: 68,
                    logic_score: 64,
                    groundedness_score: 72,
                    summary: 'Missing timeline inquiry in a cooperative case.',
                    strengths: ['Helpful tone'],
                    issues: ['Missing timeline inquiry'],
                    confidence: 0.7
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_6',
                    title: 'Timeline asked case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'cooperative',
                    request_mode: 'lead_qualification',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Fiyat bilgisi verir misiniz?', assistant_response: 'Uygun zamanlama aralığınızı paylaşabilir misiniz?', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Bütçem 5.000 TL.', assistant_response: 'Teşekkürler, not aldım.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_6',
                    handoffReadiness: 'pass',
                    askedCoverage: 1,
                    fulfillmentCoverage: 0.67,
                    missingFields: ['Zaman Çizelgesi']
                }
            ]
        })

        expect(assessments[0]?.issues).toEqual([])
        expect((assessments[0]?.summary ?? '').toLowerCase()).toContain('did-not-ask claim was cleared')
    })

    it('clears generic missing-intake issues for general-information scenarios when coverage is sufficient', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_9',
                    assistant_success: 'fail',
                    answer_quality_score: 64,
                    logic_score: 60,
                    groundedness_score: 72,
                    summary: 'Did not attempt to collect any intake fields.',
                    strengths: ['Calm tone'],
                    issues: ['No intake collection'],
                    confidence: 0.7
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_9',
                    title: 'General information case',
                    goal: 'Hizmetler hakkında genel bilgi almak.',
                    customer_profile: 'Resistant customer',
                    lead_temperature: 'cold',
                    information_sharing: 'resistant',
                    request_mode: 'general_information',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Merhaba, hizmetleriniz hakkında bilgi alabilir miyim?', assistant_response: 'Elbette, temel hizmetlerimizi paylaşabilirim.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Detay vermek istemiyorum.', assistant_response: 'Sorun değil, genel çerçevede ilerleyebiliriz.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 3, customer_message: 'Sadece genel bilgi yeterli.', assistant_response: 'Düğün ve nişan çekimi gibi hizmetler sunuyoruz.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_9',
                    handoffReadiness: 'pass',
                    askedCoverage: 0.5,
                    fulfillmentCoverage: 0.5,
                    missingFields: ['Çekim Tarihi', 'Çekim Yeri']
                }
            ]
        })

        expect(assessments[0]?.issues).toEqual([])
        expect((assessments[0]?.summary ?? '').toLowerCase()).toContain('consistency')
        expect(assessments[0]?.assistant_success).toBe('warn')
    })

    it('normalizes mismatched quoted missing-field summary to coverage-backed missing fields', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_1',
                    assistant_success: 'warn',
                    answer_quality_score: 74,
                    logic_score: 72,
                    groundedness_score: 80,
                    summary: "Missing 'Hayvan türü' impacts readiness.",
                    strengths: ['Clear tone'],
                    issues: ['Missing key intake field'],
                    confidence: 0.7
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Veteriner vaka',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'hot',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'x', assistant_response: 'y', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_1',
                    handoffReadiness: 'warn',
                    askedCoverage: 1,
                    fulfillmentCoverage: 0.8,
                    missingFields: ['Proje aciliyet seviyesi']
                }
            ]
        })

        expect(assessments[0]?.summary).toContain('Proje aciliyet seviyesi')
        expect(assessments[0]?.summary).not.toContain('Hayvan türü')
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
