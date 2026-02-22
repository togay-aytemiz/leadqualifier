import { describe, expect, it } from 'vitest'

import {
    adaptQaLabCustomerTurnToAssistantContext,
    buildExecutionErrorReport,
    calculateJudgeTargetOutputTokens,
    createGeneratorRetryUserPrompt,
    ensureActiveMissingFieldQuestion,
    enforceFieldNamedClarificationQuestion,
    expandFixtureLinesToMinimum,
    filterJudgeFindingsByCitationConsistency,
    normalizeJudgeScenarioAssessmentsForExecutedCases,
    normalizeRequiredIntakeFieldsForQaLab,
    QaLabExecutionError,
    sanitizeAssistantResponseForTruncation,
    shouldRetryJudgeForScoreAnomaly,
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

    it('replaces generic clarification questions with field-named follow-up', () => {
        const refined = enforceFieldNamedClarificationQuestion({
            response: 'Harika, devam edelim. Bu bilgiyi paylaşabilir misiniz?',
            activeMissingFields: ['Öğrenci Yaşı']
        })

        expect(refined).toContain('Öğrenci Yaşı bilgisini paylaşabilir misiniz?')
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

        expect(patched).toContain('Proje aciliyet seviyesi bilgisini paylaşabilir misiniz?')
    })

    it('does not append missing-field question when user explicitly refuses sharing', () => {
        const unchanged = ensureActiveMissingFieldQuestion({
            response: 'Anladım, mevcut bilgilerle devam edebiliriz.',
            activeMissingFields: ['Proje aciliyet seviyesi'],
            userMessage: 'Bu detayı paylaşmak istemiyorum.'
        })

        expect(unchanged).toBe('Anladım, mevcut bilgilerle devam edebiliriz.')
    })

    it('removes likely truncated numbered-list tails from assistant response', () => {
        const sanitized = sanitizeAssistantResponseForTruncation(
            'Hizmetlerimiz: 1. Web geliştirme 2. Mobil geliştirme 3. Danışmanlık 4. Proje yönetimi 5. Bakım 6.'
        )

        expect(sanitized.endsWith('6.')).toBe(false)
        expect(sanitized).toContain('Detayları ihtiyacınıza göre netleştirebiliriz.')
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
                            assistant_response: 'Uygunluk için zamanlama netleştirelim.',
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
