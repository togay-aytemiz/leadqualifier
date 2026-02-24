import { describe, expect, it } from 'vitest'

import { analyzeQaLabIntakeCoverage } from '@/lib/qa-lab/intake-coverage'

describe('analyzeQaLabIntakeCoverage', () => {
    it('marks hot/cooperative case as handoff-ready when required info is asked and fulfilled', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Butce', 'Ders sikligi', 'Iletisim tercihi'],
            cases: [
                {
                    case_id: 'scenario_1',
                    title: 'Sicak lead',
                    lead_temperature: 'hot',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Merhaba, matematik icin ozel ders ariyorum.',
                            assistant_response: 'Butce araliginiz ve haftada kac saat ders istediginizi paylasir misiniz?'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Aylik 8000 TL dusunuyoruz, haftada 2 saat olabilir.',
                            assistant_response: 'Tesekkurler. Size donus icin telefon ya da WhatsApp tercihiniz nedir?'
                        },
                        {
                            turn_index: 3,
                            customer_message: 'WhatsApp icin 5551234567 uygun.',
                            assistant_response: 'Harika, not aldim.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.totals.caseCount).toBe(1)
        expect(coverage.totals.readyCaseCount).toBe(1)
        expect(coverage.totals.averageFulfillmentCoverage).toBe(1)
        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(3)
        expect(coverage.byCase[0]?.missingFields).toEqual([])
        expect(coverage.byCase[0]?.handoffReadiness).toBe('pass')
    })

    it('flags low data collection as fail and exposes missing fields', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Butce', 'Iletisim tercihi', 'Hedef ders konusu', 'Ders sikligi'],
            cases: [
                {
                    case_id: 'scenario_2',
                    title: 'Zayif toplama',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Fiyat bilgisi alabilir miyim?',
                            assistant_response: 'Fiyatlar degisken.'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Butcem 5-6 bin araliginda.',
                            assistant_response: 'Anladim, tesekkurler.'
                        },
                        {
                            turn_index: 3,
                            customer_message: 'Simdilik bu kadar.',
                            assistant_response: 'Baska bir sey ister misiniz?'
                        }
                    ]
                }
            ]
        })

        expect(coverage.totals.failCaseCount).toBe(1)
        expect(coverage.byCase[0]?.handoffReadiness).toBe('fail')
        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.missingFields).toContain('Iletisim tercihi')
        expect(coverage.topMissingFields[0]?.count).toBeGreaterThan(0)
    })

    it('detects contact fulfillment from phone/email even when field text is generic', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Iletisim tercihi'],
            cases: [
                {
                    case_id: 'scenario_3',
                    title: 'Iletisim kanali',
                    lead_temperature: 'warm',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Bilgi almak istiyorum.',
                            assistant_response: 'Size geri donus yapabilmemiz icin iletisim tercihinizi paylasir misiniz?'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Bana ali@example.com adresinden ulasabilirsiniz.',
                            assistant_response: 'Not ettim.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.askedFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.handoffReadiness).toBe('pass')
    })

    it('detects urgency fulfillment from natural language urgency signals', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Proje aciliyet seviyesi'],
            cases: [
                {
                    case_id: 'scenario_4',
                    title: 'Aciliyet sinyali',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Fiyat bilgisi almak istiyorum.',
                            assistant_response: 'Projenin ne kadar acil oldugunu paylasir misiniz?'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Hizli baslamak istiyoruz, mumkunse en kisa surede ilerleyelim.',
                            assistant_response: 'Not ettim, onceligi yuksek olarak aliyorum.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.askedFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.missingFields).toEqual([])
    })

    it('does not mark urgency as fulfilled when customer only asks meta-priority question', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Proje aciliyet seviyesi'],
            cases: [
                {
                    case_id: 'scenario_urgency_meta',
                    title: 'Oncelik sorusu ama deger yok',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Merhaba, sureci netlestirmek istiyorum.',
                            assistant_response: 'Projenin oncelik seviyesini paylasir misiniz?'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Onceligi belirlemek icin sizce hangi bilgi daha kritik?',
                            assistant_response: 'Anladim, once kapsamdan baslayalim.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.askedFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(0)
        expect(coverage.byCase[0]?.missingFields).toContain('Proje aciliyet seviyesi')
    })

    it('marks urgency fulfilled for balanced urgency phrasing (not urgent but wants to start soon)', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Proje aciliyet seviyesi'],
            cases: [
                {
                    case_id: 'scenario_urgency_balanced',
                    title: 'Dengeli aciliyet',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Fiyat bilgisi almak istiyorum.',
                            assistant_response: 'Öncelik seviyenizi paylaşabilir misiniz (yüksek / orta / düşük)?'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Acelesi yok ama bir an once baslamak istiyorum.',
                            assistant_response: 'Anladım, buna göre planlayabiliriz.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.askedFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.missingFields).toEqual([])
    })

    it('detects service-detail fulfillment from sector-agnostic project/service language', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Hizmet Detayları'],
            cases: [
                {
                    case_id: 'scenario_service_1',
                    title: 'Yazılım Projesi',
                    lead_temperature: 'warm',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Merhaba, bilgi almak istiyorum.',
                            assistant_response: 'Hangi hizmete odaklanmak istiyorsunuz?'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Web geliştirme ve mobil uygulama tarafında destek arıyoruz.',
                            assistant_response: 'Teşekkürler, not aldım.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.askedFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.missingFields).toEqual([])
    })

    it('infers sector-agnostic semantic fulfillment when customer replies contextually after asked field', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Talep baglami'],
            cases: [
                {
                    case_id: 'scenario_5',
                    title: 'Semantik cevap',
                    lead_temperature: 'warm',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Merhaba, destek almak istiyorum.',
                            assistant_response: 'Talep bağlamını kısaca paylaşır mısınız?'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Yeni açacağımız işletme için hızlı bir başlangıç planı arıyoruz.',
                            assistant_response: 'Teşekkürler, not aldım.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.askedFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.missingFields).toEqual([])
    })

    it('infers type-like field fulfillment from sector-agnostic entity cues', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Hayvan türü', 'İşletme türü'],
            cases: [
                {
                    case_id: 'scenario_type_1',
                    title: 'Köpek Aşısı Randevusu',
                    goal: 'Köpeği için aşı randevusu almak',
                    lead_temperature: 'hot',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Merhaba, köpeğim için aşı randevusu almak istiyorum.',
                            assistant_response: 'Bütçe aralığınızı paylaşabilir misiniz?'
                        }
                    ]
                },
                {
                    case_id: 'scenario_type_2',
                    title: 'Web Geliştirme Hizmeti',
                    goal: 'İşletmesi için hizmet almak',
                    lead_temperature: 'warm',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Merhaba, freelance yazılımcıyım ve destek almak istiyorum.',
                            assistant_response: 'İşletme türünüzü paylaşabilir misiniz?'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBeGreaterThanOrEqual(1)
        expect(coverage.byCase[0]?.missingFields).not.toContain('Hayvan türü')
        expect(coverage.byCase[1]?.fulfilledFieldsCount).toBeGreaterThanOrEqual(1)
        expect(coverage.byCase[1]?.missingFields).not.toContain('İşletme türü')
    })

    it('does not infer fulfillment from deflection replies', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Talep baglami'],
            cases: [
                {
                    case_id: 'scenario_6',
                    title: 'Semantik reddetme',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Merhaba.',
                            assistant_response: 'Talep bağlamını paylaşır mısınız?'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Şu an bu detayı paylaşmak istemiyorum.',
                            assistant_response: 'Anladım.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.askedFieldsCount).toBe(1)
        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(0)
        expect(coverage.byCase[0]?.missingFields).toContain('Talep baglami')
    })

    it('does not mark field as fulfilled when customer explicitly refuses that same field', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Öğrencinin yaşı'],
            cases: [
                {
                    case_id: 'scenario_6b',
                    title: 'Alan bazli reddetme',
                    lead_temperature: 'warm',
                    information_sharing: 'partial',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Merhaba',
                            assistant_response: 'Öğrencinin yaşını paylaşabilir misiniz?'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'Yaş bilgisini şu an paylaşmak istemiyorum.',
                            assistant_response: 'Anladım, mevcut bilgilerle devam edelim.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(0)
        expect(coverage.byCase[0]?.missingFields).toContain('Öğrencinin yaşı')
    })

    it('detects question intent for natural phrasing like "ogrenebilir miyim"', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Proje Kapsami', 'Butce'],
            cases: [
                {
                    case_id: 'scenario_7',
                    title: 'Dogal soru kalibi',
                    lead_temperature: 'hot',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Web projesi icin bilgi istiyorum.',
                            assistant_response: 'Projenizin kapsamini ogrenebilir miyim?'
                        },
                        {
                            turn_index: 2,
                            customer_message: 'E-ticaret sitesi istiyoruz, butcemiz 10000 TL.',
                            assistant_response: 'Tesekkurler, not aldim.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.askedFieldsCount).toBeGreaterThan(0)
        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(2)
    })

    it('normalizes asked/fulfilled contradiction when customer proactively provides all fields', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Butce', 'Zamanlama'],
            cases: [
                {
                    case_id: 'scenario_8',
                    title: 'Proaktif bilgi paylasimi',
                    lead_temperature: 'warm',
                    information_sharing: 'cooperative',
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Butcemiz 8000 TL, gelecek hafta baslayabiliriz.',
                            assistant_response: 'Anladim, detaylari not aldim.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.fulfilledFieldsCount).toBe(2)
        expect(coverage.byCase[0]?.askedFieldsCount).toBe(2)
        expect(coverage.byCase[0]?.handoffReadiness).toBe('pass')
    })

    it('supports case-level required field overrides for policy/procedure scenarios', () => {
        const coverage = analyzeQaLabIntakeCoverage({
            requiredIntakeFields: ['Öğrencinin yaşı', 'Bütçe', 'Zaman dilimi'],
            cases: [
                {
                    case_id: 'scenario_policy',
                    title: 'İptal politikası',
                    lead_temperature: 'cold',
                    information_sharing: 'resistant',
                    required_intake_fields: [],
                    executed_turns: [
                        {
                            turn_index: 1,
                            customer_message: 'Ders iptali için kaç saat önce bildirim yapmalıyım?',
                            assistant_response: 'Genel olarak 24 saat önce bildirim istenir.'
                        }
                    ]
                }
            ]
        })

        expect(coverage.byCase[0]?.requiredFieldsTotal).toBe(0)
        expect(coverage.byCase[0]?.missingFields).toEqual([])
        expect(coverage.byCase[0]?.handoffReadiness).toBe('pass')
    })
})
