import { describe, expect, it } from 'vitest'

import {
    adaptQaLabCustomerTurnToAssistantContext,
    buildExecutionErrorReport,
    calculateJudgeTargetOutputTokens,
    createGeneratorRetryUserPrompt,
    enrichAssistantResponseWhenLowInformation,
    ensureActiveMissingFieldQuestion,
    ensureDirectQuestionStartsWithAnswer,
    ensureHotCooperativeCriticalFieldQuestion,
    ensureLeadQualificationClosureQuestion,
    enforceResponseLanguageConsistency,
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
    sanitizeAssistantResponseSurfaceArtifacts,
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
                        goal: 'Hangi terapi turunun uygun oldugunu ve baslangic uygunlugunu belirle',
                        customer_profile: 'Arastirma asamasinda',
                        lead_temperature: 'warm',
                        information_sharing: 'partial',
                        turns: [
                            { customer: 'Online hizmet var mi, gelecek hafta baslayabilir miyiz?' },
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
                            { customer: 'Once genel fiyat araligini ogrenmek isterim, butcem 4-5 bin TL olabilir.' }
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

    it('rejects scenarios when actionable lead-intent coverage is below minimum ratio', () => {
        const qualityError = validateGeneratorOutputQuality(
            {
                kb_fixture: {
                    title: 'Nova Diyet',
                    lines: [
                        'Bireysel danışmanlık ve online seans seçenekleri sunulur.',
                        'Fiyatlandırma kapsam ve seans sıklığına göre değişir.',
                        'İlk değerlendirme sonrası plan oluşturulur.',
                        'Randevu uygunluğu haftalık takvime göre belirlenir.',
                        'Hizmet akışında net ihtiyaç analizi yapılır.',
                        'Eksik bilgi tek netleştirme sorusuyla tamamlanır.'
                    ]
                },
                ground_truth: {
                    canonical_services: ['Bireysel diyet danışmanlığı', 'Online danışmanlık', 'Grup seansları'],
                    required_intake_fields: ['Bütçe', 'Zaman Çizelgesi', 'Hizmet Detayları', 'Proje aciliyet seviyesi'],
                    critical_policy_facts: ['Fiyatlar kapsam ve süreye göre değişir.'],
                    disallowed_fabricated_claims: ['Kesin kilo verme garantisi']
                },
                derived_setup: {
                    offering_profile_summary: 'Diyet ve beslenme danışmanlığı',
                    service_catalog: ['Bireysel diyet danışmanlığı', 'Online danışmanlık', 'Grup seansları'],
                    required_intake_fields: ['Bütçe', 'Zaman Çizelgesi', 'Hizmet Detayları', 'Proje aciliyet seviyesi']
                },
                scenarios: [
                    {
                        id: 'S1',
                        title: 'Genel bilgi 1',
                        goal: 'Hizmetler hakkında genel bilgi almak',
                        customer_profile: 'Araştırma',
                        lead_temperature: 'warm',
                        information_sharing: 'partial',
                        turns: [{ customer: 'Hizmetleriniz hakkında genel bilgi alabilir miyim?' }, { customer: 'Süreç nasıl ilerliyor?' }, { customer: 'Teşekkürler.' }]
                    },
                    {
                        id: 'S2',
                        title: 'Genel bilgi 2',
                        goal: 'Online hizmet modeli hakkında bilgi almak',
                        customer_profile: 'Araştırma',
                        lead_temperature: 'cold',
                        information_sharing: 'resistant',
                        turns: [{ customer: 'Online modeliniz nasıl çalışıyor?' }, { customer: 'Sadece genel çerçeve istiyorum.' }, { customer: 'Tamamdır.' }]
                    },
                    {
                        id: 'S3',
                        title: 'Genel bilgi 3',
                        goal: 'Seans sıklığı hakkında bilgi almak',
                        customer_profile: 'Araştırma',
                        lead_temperature: 'warm',
                        information_sharing: 'cooperative',
                        turns: [{ customer: 'Seanslar haftada kaç kez oluyor?' }, { customer: 'Genel bilgi yeterli.' }, { customer: 'Teşekkürler.' }]
                    },
                    {
                        id: 'S4',
                        title: 'Genel bilgi 4',
                        goal: 'Danışmanlık yaklaşımı hakkında bilgi almak',
                        customer_profile: 'Araştırma',
                        lead_temperature: 'hot',
                        information_sharing: 'cooperative',
                        turns: [{ customer: 'Danışmanlık yaklaşımınız nedir?' }, { customer: 'Detayları sonra konuşalım.' }, { customer: 'Tamam.' }]
                    },
                    {
                        id: 'S5',
                        title: 'Aksiyonel lead',
                        goal: 'Fiyat ve başlangıç tarihi netleştirme',
                        customer_profile: 'Karara yakın',
                        lead_temperature: 'hot',
                        information_sharing: 'cooperative',
                        turns: [{ customer: 'Fiyat aralığınız nedir ve ne zaman başlayabiliriz?' }, { customer: 'Bütçem 8.000 TL civarı.' }, { customer: 'Bu hafta başlanabilir mi?' }]
                    }
                ]
            },
            {
                fixture_min_lines: 6,
                scenario_count: 5
            } as unknown as Parameters<typeof validateGeneratorOutputQuality>[1]
        )

        expect(qualityError).toContain('actionable lead qualification coverage')
    })

    it('stabilizes low-actionable scenario sets to satisfy lead-intent coverage', () => {
        const runConfig = {
            fixture_min_lines: 12,
            scenario_count: 5
        } as unknown as Parameters<typeof stabilizeGeneratorOutputForQuality>[1]

        const generated = {
            kb_fixture: {
                title: 'Atlas Muhasebe',
                lines: [
                    'Atlas Muhasebe KOBİlere vergi danışmanlığı sunar.',
                    'Bordro ve raporlama süreçleri işletme ihtiyacına göre planlanır.',
                    'Fiyatlandırma kapsam ve iş yüküne göre değişir.',
                    'İlk görüşmede mevcut durum analizi yapılır.',
                    'Risk ve bağımlılık başlıkları ayrı ayrı değerlendirilir.',
                    'Hizmet adımları net aksiyon planıyla ilerletilir.',
                    'Teklif öncesi minimum bilgi seti toplanır.',
                    'Eksik bilgi tek soru ile netleştirilir.',
                    'Uygunluk ve başlangıç tarihi ayrı doğrulanır.',
                    'Kapsam değişirse fiyat aralığı güncellenir.',
                    'Destek modeli aylık veya proje bazlı olabilir.',
                    'Müşteri hedefi netleşince sonraki adım planlanır.'
                ]
            },
            ground_truth: {
                canonical_services: ['Vergi danışmanlığı', 'Bordro yönetimi', 'Finansal raporlama'],
                required_intake_fields: ['Hizmet kapsamı', 'Bütçe', 'Zamanlama'],
                critical_policy_facts: ['Fiyatlandırma kapsam ve iş yüküne göre değişir.'],
                disallowed_fabricated_claims: ['Kesin vergi avantajı garantisi']
            },
            derived_setup: {
                offering_profile_summary: 'Muhasebe ve mali danışmanlık',
                service_catalog: ['Vergi danışmanlığı', 'Bordro yönetimi', 'Finansal raporlama'],
                required_intake_fields: ['Hizmet kapsamı', 'Bütçe', 'Zamanlama']
            },
            scenarios: [
                {
                    id: 'S1',
                    title: 'Genel bilgi',
                    goal: 'Süreci genel hatlarıyla öğrenmek',
                    customer_profile: 'Araştırma aşamasında',
                    lead_temperature: 'hot' as const,
                    information_sharing: 'cooperative' as const,
                    turns: [
                        { customer: 'Hizmet modelinizi genel olarak anlatabilir misiniz?' },
                        { customer: 'Süreç adımlarını anlamak istiyorum.' },
                        { customer: 'Teşekkürler.' }
                    ]
                },
                {
                    id: 'S2',
                    title: 'Bilgilendirme',
                    goal: 'Hizmet yaklaşımını anlamak',
                    customer_profile: 'Araştırma aşamasında',
                    lead_temperature: 'warm' as const,
                    information_sharing: 'partial' as const,
                    turns: [
                        { customer: 'Vergi danışmanlığında yaklaşımınız nedir?' },
                        { customer: 'Genel bir akış bilgisi yeterli.' },
                        { customer: 'Detayı sonra konuşabiliriz.' }
                    ]
                },
                {
                    id: 'S3',
                    title: 'Dirençli araştırma',
                    goal: 'Ön bilgi almak',
                    customer_profile: 'Detay paylaşmayan müşteri',
                    lead_temperature: 'cold' as const,
                    information_sharing: 'resistant' as const,
                    turns: [
                        { customer: 'Şimdilik sadece genel bilgi almak için yazdım.' },
                        { customer: 'Detay vermeden önce yaklaşımınızı öğrenmek istiyorum.' },
                        { customer: 'Teşekkürler.' }
                    ]
                },
                {
                    id: 'S4',
                    title: 'Hizmet kapsamı',
                    goal: 'Kapsam başlıklarını görmek',
                    customer_profile: 'Araştırma aşamasında',
                    lead_temperature: 'warm' as const,
                    information_sharing: 'cooperative' as const,
                    turns: [
                        { customer: 'Hangi hizmet başlıklarında destek veriyorsunuz?' },
                        { customer: 'Önce genel çerçeveyi görmek istiyorum.' },
                        { customer: 'Tamamdır.' }
                    ]
                },
                {
                    id: 'S5',
                    title: 'Destek modeli',
                    goal: 'Aylık hizmet formatını öğrenmek',
                    customer_profile: 'Araştırma aşamasında',
                    lead_temperature: 'hot' as const,
                    information_sharing: 'partial' as const,
                    turns: [
                        { customer: 'Aylık destek modeliniz nasıl çalışıyor?' },
                        { customer: 'Süreç hakkında genel bilgi rica ederim.' },
                        { customer: 'Sonra tekrar yazarım.' }
                    ]
                }
            ]
        }

        const beforeError = validateGeneratorOutputQuality(
            generated,
            runConfig as unknown as Parameters<typeof validateGeneratorOutputQuality>[1]
        )
        const stabilized = stabilizeGeneratorOutputForQuality(
            generated,
            runConfig
        )
        const afterError = validateGeneratorOutputQuality(
            stabilized,
            runConfig as unknown as Parameters<typeof validateGeneratorOutputQuality>[1]
        )

        expect(beforeError).toContain('actionable lead qualification coverage')
        expect(afterError).toBeNull()
    })

    it('rejects scenarios when opening utterances are semantically repetitive', () => {
        const qualityError = validateGeneratorOutputQuality(
            {
                kb_fixture: {
                    title: 'Atlas Klinik',
                    lines: [
                        'Klinik hizmetleri kişiye özel planlanır.',
                        'Fiyatlar kapsam ve süreye göre değişir.',
                        'Online ve yüz yüze seçenekler mevcuttur.',
                        'İlk görüşmede hedef ve kapsam netleştirilir.',
                        'Randevu planlaması uygunluk bazlı yapılır.',
                        'Eksik bilgi adım adım tamamlanır.'
                    ]
                },
                ground_truth: {
                    canonical_services: ['Bireysel destek', 'Online destek', 'Grup seansı'],
                    required_intake_fields: ['Bütçe', 'Zaman Çizelgesi', 'Hizmet Detayları'],
                    critical_policy_facts: ['Fiyatlar kapsam ve süreye göre değişir.'],
                    disallowed_fabricated_claims: ['Garantili sonuç']
                },
                derived_setup: {
                    offering_profile_summary: 'Klinik danışmanlık',
                    service_catalog: ['Bireysel destek', 'Online destek', 'Grup seansı'],
                    required_intake_fields: ['Bütçe', 'Zaman Çizelgesi', 'Hizmet Detayları']
                },
                scenarios: [
                    {
                        id: 'S1',
                        title: 'Tekrar 1',
                        goal: 'Fiyat ve başlangıç planı',
                        customer_profile: 'Lead',
                        lead_temperature: 'hot',
                        information_sharing: 'cooperative',
                        turns: [{ customer: 'Merhaba, fiyat bilgisi alabilir miyim?' }, { customer: 'Bütçem 10.000 TL.' }, { customer: 'Bu hafta başlayalım.' }]
                    },
                    {
                        id: 'S2',
                        title: 'Tekrar 2',
                        goal: 'Fiyat ve başlangıç planı',
                        customer_profile: 'Lead',
                        lead_temperature: 'warm',
                        information_sharing: 'partial',
                        turns: [{ customer: 'Selam, fiyat bilgisi alabilir miyim?' }, { customer: 'Bütçem 8.000 TL.' }, { customer: 'Müsaitlik var mı?' }]
                    },
                    {
                        id: 'S3',
                        title: 'Tekrar 3',
                        goal: 'Fiyat ve başlangıç planı',
                        customer_profile: 'Lead',
                        lead_temperature: 'cold',
                        information_sharing: 'resistant',
                        turns: [{ customer: 'Merhaba, fiyat bilgisi alabilir miyim?' }, { customer: 'Şimdilik detay vermek istemiyorum.' }, { customer: 'Genel bilgi yeterli.' }]
                    }
                ]
            },
            {
                fixture_min_lines: 6,
                scenario_count: 3
            } as unknown as Parameters<typeof validateGeneratorOutputQuality>[1]
        )

        expect(qualityError).toContain('opening semantic diversity')
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
                scenarios: [
                    {
                        id: 'S1',
                        title: 'Fiyat ve başlangıç',
                        goal: 'Fiyat ve başlangıç uygunluğu',
                        customer_profile: 'Veli',
                        lead_temperature: 'hot',
                        information_sharing: 'cooperative',
                        turns: [
                            { customer: 'Bu hafta özel ders için fiyat alabilir miyim?' },
                            { customer: 'Bütçem 6-8 bin TL aralığında.' },
                            { customer: 'Mümkünse hızlı başlamak istiyorum.' }
                        ]
                    },
                    {
                        id: 'S2',
                        title: 'Online ders planı',
                        goal: 'Online ders için zamanlama netleştirme',
                        customer_profile: 'Veli',
                        lead_temperature: 'warm',
                        information_sharing: 'partial',
                        turns: [
                            { customer: 'Online ders için uygun saatleri öğrenebilir miyim?' },
                            { customer: 'Hafta sonu başlamak daha iyi olur.' },
                            { customer: 'Bütçeyi sonra netleştirelim.' }
                        ]
                    },
                    {
                        id: 'S3',
                        title: 'Dirençli araştırma',
                        goal: 'Genel yaklaşım sonrası olası başlangıç',
                        customer_profile: 'Veli',
                        lead_temperature: 'cold',
                        information_sharing: 'resistant',
                        turns: [
                            { customer: 'Detay vermeden önce genel yol haritasını öğrenmek istiyorum.' },
                            { customer: 'Şimdilik sadece başlangıç süresi ve fiyat aralığı önemli.' },
                            { customer: 'Müsaitlik olursa sonra netleştiririm.' }
                        ]
                    },
                    {
                        id: 'S4',
                        title: 'Konu seçimi',
                        goal: 'Hizmet kapsamı ve hedef ders konusu',
                        customer_profile: 'Veli',
                        lead_temperature: 'warm',
                        information_sharing: 'cooperative',
                        turns: [
                            { customer: 'Matematik için hangi paket uygun olur?' },
                            { customer: 'Haftada iki ders düşünüyorum.' },
                            { customer: 'Fiyatı buna göre paylaşır mısınız?' }
                        ]
                    },
                    {
                        id: 'S5',
                        title: 'Kısa vadeli talep',
                        goal: 'Acil başlangıç ve bütçe uyumu',
                        customer_profile: 'Veli',
                        lead_temperature: 'hot',
                        information_sharing: 'partial',
                        turns: [
                            { customer: 'Sınava az kaldı, mümkünse bu hafta ders ayarlayalım.' },
                            { customer: 'Bütçem 7 bin TL civarında.' },
                            { customer: 'Uygun öğretmen var mı?' }
                        ]
                    },
                    {
                        id: 'S6',
                        title: 'Takvim netleştirme',
                        goal: 'Randevu ve başlangıç tarihi netleştirme',
                        customer_profile: 'Veli',
                        lead_temperature: 'cold',
                        information_sharing: 'cooperative',
                        turns: [
                            { customer: 'Önümüzdeki ay için ders planı çıkarabilir miyiz?' },
                            { customer: 'Fiyat aralığını da görmek istiyorum.' },
                            { customer: 'Uygunluk olursa hemen kayıt olabilirim.' }
                        ]
                    }
                ]
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

    it('treats special-request style intake fields as soft optional for lead qualification', () => {
        const defaultRequiredFields = ['Hizmet Türü', 'Bütçe', 'Randevu Tarihi', 'Özel İstekler']
        const resolved = resolveQaLabScenarioRequiredIntakeFields({
            scenario: {
                id: 'scenario_soft_optional',
                title: 'Talep ve Uygunluk',
                goal: 'Uygun hizmet ve tarih bilgisi almak',
                customer_profile: 'Müşteri',
                lead_temperature: 'warm',
                information_sharing: 'partial',
                turns: [
                    { customer: 'Fiyat aralığınız nedir, bu hafta için uygunluk var mı?' }
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
                    critical_policy_facts: [],
                    disallowed_fabricated_claims: []
                },
                scenarios: []
            } as unknown as Parameters<typeof resolveQaLabScenarioRequiredIntakeFields>[0]['generated'],
            defaultRequiredFields
        })

        expect(resolved.requestMode).toBe('lead_qualification')
        expect(resolved.requiredFields).toEqual(['Hizmet Türü', 'Bütçe', 'Randevu Tarihi'])
        expect(resolved.requiredFields).not.toContain('Özel İstekler')
    })

    it('uses dynamic minimum required intake set for short (3-turn) lead scenarios', () => {
        const defaultRequiredFields = ['Hizmet Türü', 'Bütçe', 'Zamanlama', 'Randevu Tarihi', 'Özel İstekler']
        const resolved = resolveQaLabScenarioRequiredIntakeFields({
            scenario: {
                id: 'scenario_dynamic_min',
                title: 'Hızlı Karar',
                goal: 'Kısa konuşmada karar verebilmek için teklif almak',
                customer_profile: 'Müşteri',
                lead_temperature: 'hot',
                information_sharing: 'cooperative',
                turns: [
                    { customer: 'Fiyat aralığınız nedir, bu hafta başlayabilir miyiz?' },
                    { customer: 'Uygun günleri de paylaşır mısınız?' },
                    { customer: 'Netleşirse hızlıca ilerleyelim.' }
                ]
            },
            generated: {
                kb_fixture: { title: 'Örnek', lines: ['Hizmet detayları kapsamla belirlenir.'] },
                derived_setup: {
                    offering_profile_summary: 'Örnek işletme',
                    service_catalog: ['Hizmet'],
                    required_intake_fields: defaultRequiredFields
                },
                ground_truth: {
                    canonical_services: ['Hizmet'],
                    required_intake_fields: defaultRequiredFields,
                    critical_policy_facts: [],
                    disallowed_fabricated_claims: []
                },
                scenarios: []
            } as unknown as Parameters<typeof resolveQaLabScenarioRequiredIntakeFields>[0]['generated'],
            defaultRequiredFields
        })

        expect(resolved.requestMode).toBe('lead_qualification')
        expect(resolved.requiredFields.length).toBe(3)
        expect(resolved.requiredFields).toContain('Bütçe')
        expect(resolved.requiredFields).not.toContain('Özel İstekler')
    })

    it('keeps lead-qualification mode when customer asks actionable pricing despite policy-fact overlap', () => {
        const defaultRequiredFields = ['Bütçe', 'Zaman dilimi', 'İhtiyaç duyulan hizmet']
        const resolved = resolveQaLabScenarioRequiredIntakeFields({
            scenario: {
                id: 'scenario_overlap',
                title: 'Politika Notu Olan Senaryo',
                goal: 'Müşteri talebini netleştirmek',
                customer_profile: 'Müşteri',
                lead_temperature: 'warm',
                information_sharing: 'partial',
                turns: [
                    { customer: 'Fiyat aralığınız nedir ve bu hafta başlayabilir miyiz?' }
                ]
            },
            generated: {
                kb_fixture: { title: 'Örnek', lines: ['İptal bildirimleri 24 saat önce alınır.'] },
                derived_setup: {
                    offering_profile_summary: 'Örnek işletme',
                    service_catalog: ['Hizmet'],
                    required_intake_fields: defaultRequiredFields
                },
                ground_truth: {
                    canonical_services: ['Hizmet'],
                    required_intake_fields: defaultRequiredFields,
                    critical_policy_facts: ['İptal bildirimleri 24 saat önce alınır.'],
                    disallowed_fabricated_claims: []
                },
                scenarios: []
            } as unknown as Parameters<typeof resolveQaLabScenarioRequiredIntakeFields>[0]['generated'],
            defaultRequiredFields
        })

        expect(resolved.requestMode).toBe('lead_qualification')
        expect(resolved.requiredFields).toEqual(defaultRequiredFields)
    })

    it('keeps policy mode when message has explicit policy intent even with commercial keywords', () => {
        const defaultRequiredFields = ['Bütçe', 'Zaman dilimi', 'İhtiyaç duyulan hizmet']
        const resolved = resolveQaLabScenarioRequiredIntakeFields({
            scenario: {
                id: 'scenario_policy_explicit',
                title: 'İptal Koşulları',
                goal: 'İptal şartlarını öğrenmek',
                customer_profile: 'Müşteri',
                lead_temperature: 'cold',
                information_sharing: 'resistant',
                turns: [
                    { customer: 'İptal koşullarınız nedir, ücret iadesi yapıyor musunuz?' }
                ]
            },
            generated: {
                kb_fixture: { title: 'Örnek', lines: ['İptal için 24 saat önce bildirim gerekir.'] },
                derived_setup: {
                    offering_profile_summary: 'Örnek işletme',
                    service_catalog: ['Hizmet'],
                    required_intake_fields: defaultRequiredFields
                },
                ground_truth: {
                    canonical_services: ['Hizmet'],
                    required_intake_fields: defaultRequiredFields,
                    critical_policy_facts: ['İptal için 24 saat önce bildirim gerekir.'],
                    disallowed_fabricated_claims: []
                },
                scenarios: []
            } as unknown as Parameters<typeof resolveQaLabScenarioRequiredIntakeFields>[0]['generated'],
            defaultRequiredFields
        })

        expect(resolved.requestMode).toBe('policy_or_procedure')
        expect(resolved.requiredFields).toEqual([])
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

    it('promotes policy-mode scenario to lead-qualification when current turn has explicit lead intent', () => {
        const promoted = promoteQaLabScenarioRequestMode({
            currentMode: 'policy_or_procedure',
            currentRequiredFields: [],
            defaultRequiredFields: ['Bütçe', 'Hizmet Detayları', 'Zaman Çizelgesi'],
            scenarioTitle: 'İptal Koşulları',
            scenarioGoal: 'Politika detaylarını öğrenmek',
            customerMessage: 'Tamam, peki fiyat aralığınız ve bu hafta uygunluk durumunuz nedir?',
            generated: {
                kb_fixture: { title: 'Örnek', lines: ['İptal için 24 saat önce bildirim gerekir.'] },
                derived_setup: {
                    offering_profile_summary: 'Örnek işletme',
                    service_catalog: ['Hizmet'],
                    required_intake_fields: ['Bütçe', 'Hizmet Detayları', 'Zaman Çizelgesi']
                },
                ground_truth: {
                    canonical_services: ['Hizmet'],
                    required_intake_fields: ['Bütçe', 'Hizmet Detayları', 'Zaman Çizelgesi'],
                    critical_policy_facts: ['İptal için 24 saat önce bildirim gerekir.'],
                    disallowed_fabricated_claims: []
                },
                scenarios: []
            } as unknown as Parameters<typeof promoteQaLabScenarioRequestMode>[0]['generated']
        })

        expect(promoted.requestMode).toBe('lead_qualification')
        expect(promoted.requiredFields).toEqual(['Bütçe', 'Hizmet Detayları', 'Zaman Çizelgesi'])
    })

    it('applies short-scenario dynamic required-field policy on lead-mode promotion', () => {
        const promoted = promoteQaLabScenarioRequestMode({
            currentMode: 'general_information',
            currentRequiredFields: [],
            defaultRequiredFields: ['Hizmet Türü', 'Bütçe', 'Zamanlama', 'Randevu Tarihi', 'Özel İstekler'],
            scenarioTitle: 'Hızlı Teklif',
            scenarioGoal: 'Kısa akışta teklif ve uygunluk netleştirmek',
            scenarioTurnCount: 3,
            customerMessage: 'Fiyat aralığınız nedir, bu hafta başlayabilir miyiz?',
            generated: {
                kb_fixture: { title: 'Örnek', lines: ['Fiyatlar kapsama göre değişir.'] },
                derived_setup: {
                    offering_profile_summary: 'Örnek işletme',
                    service_catalog: ['Hizmet'],
                    required_intake_fields: ['Hizmet Türü', 'Bütçe', 'Zamanlama', 'Randevu Tarihi', 'Özel İstekler']
                },
                ground_truth: {
                    canonical_services: ['Hizmet'],
                    required_intake_fields: ['Hizmet Türü', 'Bütçe', 'Zamanlama', 'Randevu Tarihi', 'Özel İstekler'],
                    critical_policy_facts: [],
                    disallowed_fabricated_claims: []
                },
                scenarios: []
            } as unknown as Parameters<typeof promoteQaLabScenarioRequestMode>[0]['generated']
        })

        expect(promoted.requestMode).toBe('lead_qualification')
        expect(promoted.requiredFields.length).toBe(3)
        expect(promoted.requiredFields).toContain('Bütçe')
        expect(promoted.requiredFields).not.toContain('Özel İstekler')
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

    it('sanitizes phone-number/contact-details redirect variants into in-chat continuation', () => {
        const sanitized = sanitizeExternalContactRedirectResponse({
            response: 'Detaylar için telefon numaramızdan bize ulaşabilirsiniz. İletişim bilgilerinizi paylaşın, sizi arayalım.',
            responseLanguage: 'tr',
            requestMode: 'lead_qualification',
            userMessage: 'Bu hafta uygunluk ve fiyat öğrenmek istiyorum.',
            activeMissingFields: ['Bütçe']
        })

        expect(sanitized).toContain('Buradan devam edebiliriz.')
        expect(sanitized).toContain('Bütçe aralığınızı paylaşabilir misiniz?')
        expect(sanitized.toLowerCase()).not.toContain('telefon numaramız')
        expect(sanitized.toLowerCase()).not.toContain('iletişim bilgilerinizi paylaşın')
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

    it('prepends grounded answer when direct-question response starts with intake question only', () => {
        const patched = ensureDirectQuestionStartsWithAnswer({
            response: 'Bütçe aralığınızı paylaşabilir misiniz?',
            userMessage: 'Ne zaman başlayabilirsiniz?',
            responseLanguage: 'tr',
            kbContextLines: ['Başlangıç planı uygunluk netleşince kısa sürede oluşturulur.'],
            fallbackTopics: ['başlangıç planı']
        })

        expect(patched.startsWith('Başlangıç planı uygunluk netleşince kısa sürede oluşturulur.')).toBe(true)
        expect(patched).toContain('Bütçe aralığınızı paylaşabilir misiniz?')
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

        expect(enriched).toContain('Başlangıç süreleri yoğunluğa göre genellikle 1-2 hafta içinde planlanır.')
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

    it('enforces single explicit closure question with mini summary in lead-qualification mode', () => {
        const patched = ensureLeadQualificationClosureQuestion({
            response: 'Elbette yardımcı olurum. İsterseniz başka bir konuda da bilgi verebilirim?',
            responseLanguage: 'tr',
            requestMode: 'lead_qualification',
            userMessage: 'Buna göre ilk adım ne olsun?',
            currentUserMessage: 'Buna göre ilk adım ne olsun?',
            history: [
                { role: 'user', content: 'Bütçem 12.000 TL civarında.' },
                { role: 'assistant', content: 'Teşekkürler, not aldım.' }
            ],
            followupMissingFields: ['Proje aciliyet seviyesi'],
            requiredFields: ['Bütçe', 'Başlangıç tarihi', 'Hizmet detayları', 'Proje aciliyet seviyesi'],
            missingFields: ['Proje aciliyet seviyesi'],
            scenarioContext: {
                leadTemperature: 'warm',
                informationSharing: 'cooperative',
                turnIndex: 4
            }
        })

        expect(patched).toContain('Şu ana kadar')
        expect(patched).toContain('Öncelik seviyenizi paylaşabilir misiniz')
        expect(patched.endsWith('Öncelik seviyenizi paylaşabilir misiniz (yüksek / orta / düşük)?')).toBe(true)
        expect(patched).not.toContain('başka bir konuda da bilgi verebilirim?')
    })

    it('keeps response unchanged when closure question would pressure after explicit refusal', () => {
        const unchanged = ensureLeadQualificationClosureQuestion({
            response: 'Anladım, mevcut bilgilerle ilerleyebiliriz.',
            responseLanguage: 'tr',
            requestMode: 'lead_qualification',
            userMessage: 'Bu detayı paylaşmak istemiyorum.',
            currentUserMessage: 'Bu detayı paylaşmak istemiyorum.',
            history: [
                { role: 'user', content: 'Fiyatlarınızı öğrenmek istiyorum.' },
                { role: 'assistant', content: 'Kapsamı paylaşabilir misiniz?' }
            ],
            followupMissingFields: ['Proje aciliyet seviyesi'],
            requiredFields: ['Bütçe', 'Proje aciliyet seviyesi'],
            missingFields: ['Proje aciliyet seviyesi'],
            scenarioContext: {
                leadTemperature: 'warm',
                informationSharing: 'cooperative',
                turnIndex: 3
            }
        })

        expect(unchanged).toBe('Anladım, mevcut bilgilerle ilerleyebiliriz.')
    })

    it('humanizes snake_case field labels in explicit intake follow-up questions', () => {
        const patched = ensureActiveMissingFieldQuestion({
            response: 'Süreci genel hatlarıyla paylaşabilirim.',
            activeMissingFields: ['etkinlik_tipi'],
            userMessage: 'Fiyat bilgisi alabilir miyim?'
        })

        expect(patched).toContain('etkinlik tipi bilgisini paylaşabilir misiniz?')
        expect(patched).not.toContain('etkinlik_tipi')
    })

    it('normalizes resistant pricing turns to one soft critical-field ask without pressure', () => {
        const patched = ensureLeadQualificationClosureQuestion({
            response: 'Şu ana kadar bütçe aralığı ve ihtiyaç duyulan hizmet/konu bilgisini not aldım.',
            responseLanguage: 'tr',
            requestMode: 'lead_qualification',
            userMessage: 'Fiyatlarınızı öğrenmek yeterli.',
            currentUserMessage: 'Fiyatlarınızı öğrenmek yeterli.',
            history: [
                { role: 'user', content: 'Sadece bilgi almak istiyorum.' },
                { role: 'assistant', content: 'Etkinlik türünüzü paylaşır mısınız?' }
            ],
            followupMissingFields: ['etkinlik_tipi', 'çekim_tarihi'],
            requiredFields: ['etkinlik_tipi', 'çekim_tarihi', 'bütçe'],
            missingFields: ['etkinlik_tipi', 'çekim_tarihi'],
            scenarioContext: {
                leadTemperature: 'cold',
                informationSharing: 'resistant',
                turnIndex: 3
            }
        })

        expect(patched).toContain('Fiyatlandırma, seçilen kapsam ve iş yüküne göre netleşir.')
        expect(patched).toContain('Uygunsanız sadece')
        expect(patched).toContain('Paylaşmak istemezseniz mevcut bilgilerle genel çerçevede devam edebiliriz.')
    })

    it('removes likely truncated numbered-list tails from assistant response', () => {
        const sanitized = sanitizeAssistantResponseForTruncation(
            'Hizmetlerimiz: 1. Web geliştirme 2. Mobil geliştirme 3. Danışmanlık 4. Proje yönetimi 5. Bakım 6.'
        )

        expect(sanitized.endsWith('6.')).toBe(false)
        expect(sanitized).toContain('Detayları ihtiyacınıza göre netleştirebiliriz.')
    })

    it('normalizes numeric and punctuation spacing artifacts in assistant response surface text', () => {
        const sanitized = sanitizeAssistantResponseSurfaceArtifacts(
            'Bütçeniz 12. 000 TL ve aceleniz olmadığını not aldım. ( Örneğin, bireysel danışmanlık ).'
        )

        expect(sanitized).toContain('12.000 TL')
        expect(sanitized).toContain('(Örneğin, bireysel danışmanlık).')
        expect(sanitized).not.toContain('12. 000')
        expect(sanitized).not.toContain('( Örneğin')
    })

    it('keeps response language aligned with Turkish user turns when mixed-language chunks leak', () => {
        const normalized = enforceResponseLanguageConsistency({
            response: 'Maalesef, randevu iptali için gerekli işlemleri gerçekleştiremiyorum. We can continue here and clarify the best available options.',
            responseLanguage: 'tr'
        })

        expect(normalized).toContain('Maalesef, randevu iptali için gerekli işlemleri gerçekleştiremiyorum.')
        expect(normalized).toContain('Buradan devam ederek uygun seçenekleri netleştirebiliriz.')
        expect(normalized).not.toContain('We can continue here')
    })

    it('keeps response language aligned with English user turns when mixed-language chunks leak', () => {
        const normalized = enforceResponseLanguageConsistency({
            response: 'I cannot process cancellation directly. Buradan devam ederek uygun seçenekleri netleştirebiliriz.',
            responseLanguage: 'en'
        })

        expect(normalized).toContain('I cannot process cancellation directly.')
        expect(normalized).toContain('We can continue here and clarify the best available options.')
        expect(normalized).not.toContain('Buradan devam ederek uygun seçenekleri netleştirebiliriz.')
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

    it('replaces generic unknown response with grounded KB detail when available', () => {
        const refined = refineQaLabGenericUnknownResponse({
            response: 'Bu konuda net bilgi bulamadım. Biraz daha detay paylaşır mısınız?',
            responseLanguage: 'tr',
            requestMode: 'lead_qualification',
            userMessage: 'Bütçem 12.000 TL civarında, ne zaman başlayabiliriz?',
            activeMissingFields: [],
            fallbackTopics: ['hizmet kapsamı'],
            kbContextLines: ['Başlangıç planı uygunluk ve kapsam netleştiğinde kısa sürede oluşturulur.']
        })

        expect(refined).toContain('Başlangıç planı uygunluk ve kapsam netleştiğinde kısa sürede oluşturulur.')
        expect(refined).not.toContain('net bilgi bulamadım')
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

    it('drops insufficient follow-up inquiry findings when transcript already includes same-field ask', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'minor',
                    violated_rule: 'Insufficient follow-up on budget inquiries.',
                    evidence: '[scenario_id=scenario_1, turn=3]',
                    rationale: 'The assistant did not effectively follow up on the budget field.',
                    suggested_fix: 'Ask budget earlier and follow up clearly.',
                    target_layer: 'pipeline',
                    effort: 'low',
                    confidence: 0.6
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'Warm case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Merhaba', assistant_response: 'Bütçe aralığınızı paylaşır mısınız?', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Bütçem 10.000 TL civarında.', assistant_response: 'Teşekkürler, not aldım.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 3, customer_message: 'Devam edelim.', assistant_response: 'Uygunluk için zaman aralığı paylaşabilir misiniz?', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ]
        })

        expect(filtered).toHaveLength(0)
    })

    it('drops missing-field findings when the only missing field was asked on the final turn', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'minor',
                    violated_rule: "Missing 'Proje aciliyet seviyesi'",
                    evidence: '[scenario_id=scenario_12, turn=3]',
                    rationale: "Assistant did not collect 'Proje aciliyet seviyesi'.",
                    suggested_fix: 'Collect urgency before close.',
                    target_layer: 'pipeline',
                    effort: 'low',
                    confidence: 0.62
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_12',
                    title: 'Final turn ask case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    request_mode: 'lead_qualification',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Fiyat alabilir miyim?', assistant_response: 'Fiyat kapsam ve süreye göre değişir.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Bütçem 7.000 TL.', assistant_response: 'Teşekkürler, not aldım.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 3, customer_message: 'Seçenekler nedir?', assistant_response: 'Öncelik seviyenizi paylaşabilir misiniz (yüksek / orta / düşük)?', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_12',
                    handoffReadiness: 'pass',
                    askedCoverage: 0.75,
                    fulfillmentCoverage: 0.75,
                    missingFields: ['Proje aciliyet seviyesi']
                }
            ]
        })

        expect(filtered).toHaveLength(0)
    })

    it('drops finding when cited scenario summary explicitly says missing-field claim was cleared', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'minor',
                    violated_rule: 'Insufficient follow-up on budget inquiries.',
                    evidence: '[scenario_id=scenario_1, turn=2]',
                    rationale: 'The assistant did not effectively follow up on the budget field.',
                    suggested_fix: 'Ask budget clearly.',
                    target_layer: 'pipeline',
                    effort: 'low',
                    confidence: 0.6
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_1',
                    title: 'General info case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'cold',
                    information_sharing: 'partial',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Merhaba, genel bilgi almak istiyorum.', assistant_response: 'Elbette, kapsam ve süreç hakkında bilgi verebilirim.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Tamamdır.', assistant_response: 'İhtiyacınıza göre ilerleyebiliriz.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            scenarioAssessments: [
                {
                    case_id: 'scenario_1',
                    assistant_success: 'pass',
                    answer_quality_score: 78,
                    logic_score: 80,
                    groundedness_score: 82,
                    summary: 'Scenario-level missing-field warning was cleared by intake-coverage consistency check.',
                    strengths: ['Relevant answer'],
                    issues: [],
                    confidence: 0.7,
                    source: 'judge'
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

    it('drops proactive-questioning findings for cold-resistant general-information cases when context is already sufficient', () => {
        const filtered = filterJudgeFindingsByCitationConsistency({
            findings: [
                {
                    severity: 'minor',
                    violated_rule: 'Conversation quality - lack of proactive questioning',
                    evidence: '[scenario_id=scenario_9, turn=3]',
                    rationale: 'Failed to engage effectively due to cold lead.',
                    suggested_fix: 'Ask more proactive follow-up questions.',
                    target_layer: 'pipeline',
                    effort: 'low',
                    confidence: 0.6
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_9',
                    title: 'Cold resistant info case',
                    goal: 'General information',
                    customer_profile: 'Resistant customer',
                    lead_temperature: 'cold',
                    information_sharing: 'resistant',
                    request_mode: 'general_information',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Yazılım geliştirme süreciniz nasıl ilerliyor?',
                            assistant_response: 'Süreç önce ihtiyaç analizi ve kapsam netliği ile başlar.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Detay vermek istemiyorum.',
                            assistant_response: 'Sorun değil, genel çerçevede ilerleyebiliriz; fiyatlar kapsam ve iş yüküne göre değişir.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        },
                        {
                            turn_index: 3,
                            customer_message: 'Şimdilik bu kadar.',
                            assistant_response: 'İsterseniz minimum başlangıç paketi ve olası takvim aralığını paylaşabilirim.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_9',
                    handoffReadiness: 'pass',
                    askedCoverage: 0.5,
                    fulfillmentCoverage: 0.5,
                    missingFields: ['Proje Başlangıç Tarihi']
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

    it('softens final-turn missing-field penalties when assistant asked remaining field on the last turn', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_12',
                    assistant_success: 'warn',
                    answer_quality_score: 76,
                    logic_score: 74,
                    groundedness_score: 80,
                    summary: "Discussed pricing but missed 'Proje aciliyet seviyesi'.",
                    strengths: ['Pricing basis was explained'],
                    issues: ["Missing 'Proje aciliyet seviyesi'"],
                    confidence: 0.72
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_12',
                    title: 'Final turn ask case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    request_mode: 'lead_qualification',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Fiyatlar nedir?', assistant_response: 'Fiyatlar kapsam ve süreye göre değişir.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 2, customer_message: 'Bütçem 300 TL civarı.', assistant_response: 'Bütçenizi not aldım.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } },
                        { turn_index: 3, customer_message: 'Tamam, seçenekler nedir?', assistant_response: 'Öncelik seviyenizi paylaşabilir misiniz (yüksek / orta / düşük)?', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_12',
                    handoffReadiness: 'pass',
                    askedCoverage: 0.75,
                    fulfillmentCoverage: 0.75,
                    missingFields: ['Proje aciliyet seviyesi']
                }
            ]
        })

        expect(assessments[0]?.issues).toEqual([])
        expect((assessments[0]?.summary ?? '').toLowerCase()).toContain('softened')
        expect(assessments[0]?.assistant_success).toBe('pass')
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

    it('clears proactive-questioning warnings for cold-resistant general-information scenarios with sufficient coverage', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_9',
                    assistant_success: 'warn',
                    answer_quality_score: 68,
                    logic_score: 66,
                    groundedness_score: 76,
                    summary: 'Failed to engage effectively due to cold lead.',
                    strengths: ['Grounded tone'],
                    issues: ['Lack of proactive questioning'],
                    confidence: 0.8
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_9',
                    title: 'Cold resistant info case',
                    goal: 'Genel bilgi almak.',
                    customer_profile: 'Resistant customer',
                    lead_temperature: 'cold',
                    information_sharing: 'resistant',
                    request_mode: 'general_information',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Merhaba, yazılım geliştirme süreci hakkında bilgi almak istiyorum.',
                            assistant_response: 'Yazılım geliştirme sürecimiz ihtiyaç analizi ve kapsam netliği ile başlar.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Detay vermek istemiyorum.',
                            assistant_response: 'Sorun değil, genel çerçevede ilerleyebiliriz; fiyatlar kapsam ve iş yüküne göre değişir.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        },
                        {
                            turn_index: 3,
                            customer_message: 'Şimdilik bu kadar.',
                            assistant_response: 'İsterseniz minimum başlangıç paketi ve olası takvim aralığını paylaşabilirim.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_9',
                    handoffReadiness: 'pass',
                    askedCoverage: 0.5,
                    fulfillmentCoverage: 0.5,
                    missingFields: ['Proje Başlangıç Tarihi']
                }
            ]
        })

        expect(assessments[0]?.assistant_success).toBe('pass')
        expect((assessments[0]?.summary ?? '').toLowerCase()).toContain('proactive-questioning warning was cleared')
        expect(assessments[0]?.issues).toEqual([])
    })

    it('removes stale missing-field issues when summary says the claim was cleared by consistency', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_10',
                    assistant_success: 'warn',
                    answer_quality_score: 70,
                    logic_score: 68,
                    groundedness_score: 80,
                    summary: 'Scenario-level missing-field warning was cleared by intake-coverage consistency check.',
                    strengths: ['Grounded response'],
                    issues: ['Missing budget inquiry.', 'Tone can be slightly shorter.'],
                    confidence: 0.7
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_10',
                    title: 'Consistency clear case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    request_mode: 'lead_qualification',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Fiyat bilgisi istiyorum.', assistant_response: 'Fiyatlar kapsam ve süreye göre değişir.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_10',
                    handoffReadiness: 'warn',
                    askedCoverage: 0.6,
                    fulfillmentCoverage: 0.5,
                    missingFields: ['Bütçe']
                }
            ]
        })

        expect(assessments[0]?.summary).toContain('cleared by intake-coverage consistency check')
        expect(assessments[0]?.issues).toEqual(['Tone can be slightly shorter.'])
    })

    it('removes stale repetitive-question issues when summary says repetitive warning was cleared', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_11',
                    assistant_success: 'warn',
                    answer_quality_score: 72,
                    logic_score: 70,
                    groundedness_score: 84,
                    summary: 'Scenario-level repetitive-question warning was cleared by intake-coverage consistency check.',
                    strengths: ['Polite tone'],
                    issues: ['Repetitive questioning observed.', 'Response could be more concise.'],
                    confidence: 0.72
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_11',
                    title: 'Repetition clear case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'warm',
                    information_sharing: 'cooperative',
                    request_mode: 'lead_qualification',
                    executed_turns: [
                        { turn_index: 1, customer_message: 'Hizmet detayını öğrenmek istiyorum.', assistant_response: 'Elbette, kapsamı paylaşabilirim.', token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_11',
                    handoffReadiness: 'pass',
                    askedCoverage: 0.9,
                    fulfillmentCoverage: 0.85,
                    missingFields: []
                }
            ]
        })

        expect(assessments[0]?.issues).toEqual(['Response could be more concise.'])
    })

    it('clears pricing-detail false positives when KB has no concrete numeric pricing and assistant gives pricing basis', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_12',
                    assistant_success: 'warn',
                    answer_quality_score: 58,
                    logic_score: 60,
                    groundedness_score: 72,
                    summary: 'Did not provide concrete pricing information.',
                    strengths: ['Acknowledged customer inquiry'],
                    issues: ['Failed to provide pricing details'],
                    confidence: 0.8
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_12',
                    title: 'General pricing query',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'cold',
                    information_sharing: 'resistant',
                    request_mode: 'general_information',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Fiyat aralığınız nedir?',
                            assistant_response: 'Fiyatlandırma hizmetin kapsamı, iş yükü ve süreye göre değişir.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_12',
                    handoffReadiness: 'pass',
                    askedCoverage: 1,
                    fulfillmentCoverage: 1,
                    missingFields: []
                }
            ],
            hasConcretePricingFacts: false
        })

        expect(assessments[0]?.assistant_success).toBe('pass')
        expect((assessments[0]?.summary ?? '').toLowerCase()).toContain('pricing-detail warning was cleared')
        expect(assessments[0]?.issues).toEqual([])
    })

    it('clears missed-budget did-not-ask summaries when transcript already includes budget question', () => {
        const assessments = normalizeJudgeScenarioAssessmentsForExecutedCases({
            raw: [
                {
                    case_id: 'scenario_13',
                    assistant_success: 'warn',
                    answer_quality_score: 70,
                    logic_score: 74,
                    groundedness_score: 80,
                    summary: 'Good initial response but missed budget inquiry.',
                    strengths: ['Clear explanation'],
                    issues: ['Failed to ask for budget'],
                    confidence: 0.7
                }
            ],
            executedCases: [
                {
                    case_id: 'scenario_13',
                    title: 'Budget asked case',
                    goal: 'Goal',
                    customer_profile: 'Profile',
                    lead_temperature: 'hot',
                    information_sharing: 'cooperative',
                    request_mode: 'lead_qualification',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Fiyat bilgisi istiyorum.',
                            assistant_response: 'Bütçe aralığınızı paylaşabilir misiniz?',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Bütçem 5000 TL civarında.',
                            assistant_response: 'Teşekkürler, not aldım.',
                            token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }
                        }
                    ]
                }
            ],
            intakeCoverageByCase: [
                {
                    caseId: 'scenario_13',
                    handoffReadiness: 'pass',
                    askedCoverage: 1,
                    fulfillmentCoverage: 1,
                    missingFields: []
                }
            ]
        })

        expect(assessments[0]?.assistant_success).toBe('pass')
        expect((assessments[0]?.summary ?? '').toLowerCase()).toContain('did-not-ask claim was cleared')
        expect(assessments[0]?.issues).toEqual([])
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
        const qaAssistantProfile = toRecord(reportRecord.qa_assistant_profile)
        const errorRecord = toRecord(reportRecord.error)
        const detailsRecord = toRecord(errorRecord.details)

        expect(qaAssistantProfile.assistant_id).toBe('qa_lab_simulated_assistant')
        expect(qaAssistantProfile.profile_version).toBe('v2')
        expect(qaAssistantProfile.auto_port_to_live).toBe(false)
        expect(errorRecord.message).toBe('Generator response is not valid JSON')
        expect(detailsRecord.stage).toBe('generator')
        expect(detailsRecord.maxAttempts).toBe(3)
        expect(Array.isArray(detailsRecord.attempts)).toBe(true)
    })
})
