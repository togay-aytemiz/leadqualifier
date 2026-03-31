import { describe, expect, it } from 'vitest'
import {
    buildExtractionSystemPrompt,
    buildLeadExtractionConversationContext,
    calibrateLeadScoreFromExtraction,
    mergeExtractionWithExisting,
    normalizeLowSignalLeadStatus,
    parseRequiredIntakeRepairPayload,
    repairLeadExtractionRequiredIntake,
    resolvePersistedServiceType,
    resolvePersistedServiceTypes,
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

    it('parses multi-service payload and keeps deduped services', () => {
        const result = safeParseLeadExtraction('{"service_type":"Yenidoğan çekimi","services":["Yenidoğan çekimi","Hamile çekimi","hamile çekimi"]}')
        expect(result.service_type).toBe('Yenidoğan çekimi')
        expect(result.services).toEqual([
            'Yenidoğan çekimi',
            'Hamile çekimi'
        ])
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
        expect(result.status).toBe('cold')
    })

    it('accepts localized score/status strings', () => {
        const result = safeParseLeadExtraction('{"score": "9/10", "status": "Sıcak"}')
        expect(result.score).toBe(9)
        expect(result.status).toBe('hot')
    })

    it('maps undetermined status aliases to cold', () => {
        const result = safeParseLeadExtraction('{"score": 1, "status": "Belirsiz"}')
        expect(result.score).toBe(1)
        expect(result.status).toBe('cold')
    })

    it('normalizes required_intake_collected object values', () => {
        const result = safeParseLeadExtraction('{"required_intake_collected":{"Telefon":" 555 ","Bütçe":["15.000 TL",1],"Ad Soyad":" "}}')
        expect(result.required_intake_collected).toEqual({
            Telefon: '555',
            'Bütçe': '15.000 TL'
        })
    })
})

describe('buildExtractionSystemPrompt', () => {
    it('instructs required intake collection to use exact field labels and high-confidence semantic matches', () => {
        const prompt = buildExtractionSystemPrompt('Turkish')

        expect(prompt).toContain('Use the exact required intake field labels as object keys')
        expect(prompt).toContain('Match required fields by meaning, not only exact wording')
        expect(prompt).toContain('High-confidence implied answers can be included')
        expect(prompt).toContain('Approximate or range-style customer answers are valid values')
    })
})

describe('repairLeadExtractionRequiredIntake', () => {
    it('backfills missing required intake fields from contextual conversation evidence', () => {
        const repaired = repairLeadExtractionRequiredIntake({
            extracted: safeParseLeadExtraction('{"required_intake_collected":{"Hamilelik Durumu":"Evet"},"summary":"Fiyat bilgisi istiyor."}'),
            requiredFields: ['Bebek Doğum Tarihi', 'Hamilelik Durumu'],
            recentAssistantMessages: ['Tahminen bebişin gelişi ne zaman'],
            recentCustomerMessages: ['Temmuz sonu ağustos başı gibi']
        })

        expect(repaired.required_intake_collected).toEqual({
            'Hamilelik Durumu': 'Evet',
            'Bebek Doğum Tarihi': 'Temmuz sonu ağustos başı gibi'
        })
    })

    it('replaces incompatible sibling values before inferring the correct related status', () => {
        const repaired = repairLeadExtractionRequiredIntake({
            extracted: safeParseLeadExtraction('{"required_intake_collected":{"Hamilelik Durumu":"Ağustos ayı gibi inşaAllah"},"summary":"Detay istiyor."}'),
            requiredFields: ['Bebek Doğum Tarihi', 'Hamilelik Durumu'],
            recentAssistantMessages: ['Tahminen bebişin gelişi ne zaman'],
            recentCustomerMessages: ['Ağustos ayı gibi inşaAllah']
        })

        expect(repaired.required_intake_collected).toEqual({
            'Bebek Doğum Tarihi': 'Ağustos ayı gibi inşaAllah',
            'Hamilelik Durumu': 'Evet'
        })
    })
})

describe('parseRequiredIntakeRepairPayload', () => {
    it('keeps only allowed required field labels from repair payloads', () => {
        const parsed = parseRequiredIntakeRepairPayload(
            '{"required_intake_collected":{"Hamilelik Durumu":"Evet","Bebek Doğum Tarihi":"Temmuz sonu ağustos başı","Not":"ignore"}}',
            ['Hamilelik Durumu', 'Bebek Doğum Tarihi']
        )

        expect(parsed).toEqual({
            'Hamilelik Durumu': 'Evet',
            'Bebek Doğum Tarihi': 'Temmuz sonu ağustos başı'
        })
    })
})

describe('mergeExtractionWithExisting', () => {
    it('keeps summary aligned and clears service when incoming extraction has no service', () => {
        const merged = mergeExtractionWithExisting(
            {
                service_type: null,
                services: [],
                desired_date: null,
                location: null,
                budget_signals: [],
                intent_signals: [],
                risk_signals: ['indecisive'],
                required_intake_collected: {},
                required_intake_overrides: {},
                required_intake_override_meta: {},
                non_business: true,
                summary: null,
                score: 0,
                status: 'cold'
            },
            {
                service_type: 'Yenidoğan çekimi',
                services: ['Yenidoğan çekimi'],
                summary: 'Müşteri randevu istiyor.',
                extracted_fields: {
                    services: ['Yenidoğan çekimi'],
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
                services: ['1 yaş çekimi'],
                desired_date: '5 Nisan',
                location: 'Üsküdar',
                budget_signals: ['20.000 TL'],
                intent_signals: ['urgent'],
                risk_signals: [],
                required_intake_collected: {
                    Telefon: '05551112233'
                },
                required_intake_overrides: {},
                required_intake_override_meta: {},
                non_business: false,
                summary: 'Müşteri tarihi güncelledi.',
                score: 8,
                status: 'hot'
            },
            {
                service_type: 'Yenidoğan çekimi',
                services: ['Yenidoğan çekimi'],
                summary: 'Eski özet',
                extracted_fields: {
                    services: ['Yenidoğan çekimi'],
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

    it('keeps required intake overrides and metadata when AI extraction reruns', () => {
        const merged = mergeExtractionWithExisting(
            {
                service_type: 'Yenidoğan çekimi',
                services: ['Yenidoğan çekimi'],
                desired_date: '5 Nisan',
                location: null,
                budget_signals: [],
                intent_signals: [],
                risk_signals: [],
                required_intake_collected: {
                    Telefon: '05550000000'
                },
                required_intake_overrides: {},
                required_intake_override_meta: {},
                non_business: false,
                summary: 'Yeni özet',
                score: 7,
                status: 'warm'
            },
            {
                extracted_fields: {
                    required_intake_collected: {
                        Telefon: '05550000000'
                    },
                    required_intake_overrides: {
                        telefon: '05551112233'
                    },
                    required_intake_override_meta: {
                        telefon: {
                            updated_at: '2026-03-15T10:00:00.000Z',
                            updated_by: 'profile-1'
                        }
                    }
                }
            }
        )

        expect(merged.required_intake_overrides).toEqual({
            telefon: '05551112233'
        })
        expect(merged.required_intake_override_meta).toEqual({
            telefon: {
                updated_at: '2026-03-15T10:00:00.000Z',
                updated_by: 'profile-1',
                source: 'manual'
            }
        })
    })

    it('keeps a manual service override authoritative across AI reruns', () => {
        const merged = mergeExtractionWithExisting(
            {
                service_type: 'Yenidoğan çekimi',
                services: ['Yenidoğan çekimi'],
                desired_date: null,
                location: null,
                budget_signals: [],
                intent_signals: [],
                risk_signals: [],
                required_intake_collected: {},
                required_intake_overrides: {},
                required_intake_override_meta: {},
                non_business: false,
                summary: 'Yeni özet',
                score: 6,
                status: 'warm'
            },
            {
                service_type: 'Hamile çekimi',
                extracted_fields: {
                    services: ['Yenidoğan çekimi'],
                    service_override: 'Hamile çekimi',
                    service_override_meta: {
                        updated_at: '2026-03-16T09:00:00.000Z',
                        updated_by: 'profile-1',
                        source: 'manual'
                    }
                }
            }
        )

        expect(merged.service_type).toBe('Hamile çekimi')
        expect(merged.services).toEqual(['Yenidoğan çekimi'])
        expect(merged.service_override).toBe('Hamile çekimi')
        expect(merged.service_override_meta).toEqual({
            updated_at: '2026-03-16T09:00:00.000Z',
            updated_by: 'profile-1',
            source: 'manual'
        })
    })

    it('keeps score/status aligned with previously captured buying signals after a later acknowledgement turn', () => {
        const merged = mergeExtractionWithExisting(
            {
                service_type: null,
                services: [],
                desired_date: null,
                location: null,
                budget_signals: [],
                intent_signals: [],
                risk_signals: [],
                required_intake_collected: {},
                required_intake_overrides: {},
                required_intake_override_meta: {},
                non_business: false,
                summary: 'Müşteri teşekkür etti.',
                score: 0,
                status: 'cold'
            },
            {
                service_type: null,
                summary: 'Müşteri fiyat bilgisi almak istiyor.',
                extracted_fields: {
                    intent_stage: 'qualification',
                    budget_signals: [],
                    intent_signals: ['decisive'],
                    required_intake_collected: {
                        'Hamilelik Durumu': 'Evet',
                        'Bebek Doğum Tarihi': 'Temmuz sonu ağustos başı gibi'
                    }
                }
            }
        )

        expect(merged.required_intake_collected).toEqual({
            'Hamilelik Durumu': 'Evet',
            'Bebek Doğum Tarihi': 'Temmuz sonu ağustos başı gibi'
        })
        expect(merged.intent_stage).toBe('qualification')
        expect(merged.score).toBe(8)
        expect(merged.status).toBe('hot')
    })
})

describe('calibrateLeadScoreFromExtraction', () => {
    it('treats qualification-stage inquiry plus service-specific intake evidence as a hot lead floor', () => {
        const calibrated = calibrateLeadScoreFromExtraction(
            safeParseLeadExtraction(`{
                "service_type": null,
                "services": [],
                "desired_date": null,
                "location": null,
                "budget_signals": [],
                "intent_signals": [],
                "risk_signals": [],
                "required_intake_collected": {
                    "Hamilelik Durumu": "Evet",
                    "Bebek Doğum Tarihi": "Mayıs ayı"
                },
                "intent_stage": "qualification",
                "non_business": false,
                "summary": "Müşteri bunun hakkında daha fazla bilgi almak istiyor.",
                "score": 5,
                "status": "warm"
            }`)
        )

        expect(calibrated.serviceFit).toBe(3)
        expect(calibrated.intentScore).toBe(5)
        expect(calibrated.totalScore).toBe(8)
        expect(calibrated.status).toBe('hot')
    })

    it('treats a first-message commercial inquiry as warm even before service is confirmed', () => {
        const calibrated = calibrateLeadScoreFromExtraction(
            safeParseLeadExtraction(`{
                "service_type": null,
                "services": [],
                "desired_date": null,
                "location": null,
                "budget_signals": [],
                "intent_signals": [],
                "risk_signals": [],
                "required_intake_collected": {},
                "intent_stage": "informational_commercial",
                "non_business": false,
                "summary": "Müşteri bunun hakkında daha fazla bilgi almak istiyor.",
                "score": 3,
                "status": "cold"
            }`)
        )

        expect(calibrated.totalScore).toBe(5)
        expect(calibrated.status).toBe('warm')
    })
})

describe('media-backed commercial inquiry promotion', () => {
    it('promotes attachment-backed generic info requests to warm commercial intent', async () => {
        const moduleExports = await import('@/lib/leads/extraction')
        const promoteMediaBackedCommercialIntent = (
            moduleExports as Record<string, unknown>
        ).promoteMediaBackedCommercialIntent as
            | ((args: {
                extracted: ReturnType<typeof safeParseLeadExtraction>
                messages: Array<{
                    sender_type: string
                    content: string
                    metadata: Record<string, unknown>
                }>
            }) => ReturnType<typeof safeParseLeadExtraction>)
            | undefined

        expect(promoteMediaBackedCommercialIntent).toBeTypeOf('function')

        const promoted = promoteMediaBackedCommercialIntent?.({
            extracted: safeParseLeadExtraction(`{
                "service_type": null,
                "services": [],
                "desired_date": null,
                "location": null,
                "budget_signals": [],
                "intent_signals": [],
                "risk_signals": [],
                "required_intake_collected": {},
                "intent_stage": "none",
                "non_business": false,
                "summary": "Müşteri bunun hakkında daha fazla bilgi almak istiyor.",
                "score": 1,
                "status": "cold"
            }`),
            messages: [
                {
                    sender_type: 'contact',
                    content: '[Instagram image]',
                    metadata: {
                        instagram_event_type: 'attachment',
                        instagram_media: {
                            type: 'image',
                            storage_url: 'https://cdn.example.com/instagram-media-1.jpg',
                            caption: 'Merhaba, bunun hakkında daha fazla bilgi alabilir miyim?'
                        }
                    }
                }
            ]
        })

        expect(promoted?.intent_stage).toBe('informational_commercial')

        const calibrated = calibrateLeadScoreFromExtraction(promoted ?? safeParseLeadExtraction('{}'))
        expect(calibrated.totalScore).toBe(5)
        expect(calibrated.status).toBe('warm')
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

    it('accepts service when customer matches profile-service signal but inferred service is another language', () => {
        const accept = shouldAcceptInferredServiceType({
            serviceType: 'Newborn photoshoot',
            customerMessages: [
                'Yenidoğan çekimi ile ilgili bilgi istiyorum',
                'Randevu nasıl alabilirim?'
            ],
            catalogItems: [],
            profileSummary: 'Yenidoğan fotoğraf çekim hizmeti sunan bir stüdyo.'
        })
        expect(accept).toBe(true)
    })
})

describe('resolvePersistedServiceType', () => {
    it('maps inferred alias value to canonical catalog service name', () => {
        const serviceType = resolvePersistedServiceType({
            serviceType: 'Newborn photoshoot',
            customerMessages: ['Newborn photoshoot için fiyat alabilir miyim?'],
            catalogItems: [
                {
                    name: 'Yenidoğan çekimi',
                    aliases: ['newborn photoshoot', 'newborn shoot']
                }
            ]
        })
        expect(serviceType).toBe('Yenidoğan çekimi')
    })

    it('keeps inferred value when catalog is empty but profile signal confirms service', () => {
        const serviceType = resolvePersistedServiceType({
            serviceType: 'Newborn photoshoot',
            customerMessages: ['Yenidoğan çekimi ile ilgili bilgi istiyorum'],
            catalogItems: [],
            profileSummary: 'Yenidoğan fotoğraf çekim hizmeti sunan bir stüdyo.'
        })
        expect(serviceType).toBe('Newborn photoshoot')
    })

    it('returns null when customer messages are greeting-only', () => {
        const serviceType = resolvePersistedServiceType({
            serviceType: 'Yenidoğan çekimi',
            customerMessages: ['Merhaba']
        })
        expect(serviceType).toBeNull()
    })
})

describe('resolvePersistedServiceTypes', () => {
    it('maps multi-language aliases to canonical catalog names and dedupes', () => {
        const services = resolvePersistedServiceTypes({
            serviceType: 'Newborn photoshoot',
            services: ['newborn shoot', 'Maternity photoshoot', 'hamile çekimi'],
            customerMessages: ['Newborn shoot ve maternity photoshoot düşünüyorum.'],
            catalogItems: [
                {
                    name: 'Yenidoğan çekimi',
                    aliases: ['newborn photoshoot', 'newborn shoot']
                },
                {
                    name: 'Hamile çekimi',
                    aliases: ['maternity photoshoot', 'pregnancy shoot']
                }
            ]
        })

        expect(services).toEqual([
            'Yenidoğan çekimi',
            'Hamile çekimi'
        ])
    })

    it('recovers a catalog service from summary evidence when raw service fields are empty', () => {
        const services = resolvePersistedServiceTypes({
            serviceType: null,
            services: [],
            customerMessages: ['Bebek fotoğrafçılığı hakkında bilgi almak istiyorum.'],
            catalogItems: [
                {
                    name: 'Yenidoğan çekimi',
                    aliases: ['newborn photography']
                }
            ],
            summary: 'Müşteri, yenidoğan bebek fotoğrafçılığı hakkında bilgi almak istiyor ve 1 ay içinde doğum bekliyor.'
        })

        expect(services).toEqual(['Yenidoğan çekimi'])
    })

    it('returns empty array when no customer service clue exists', () => {
        const services = resolvePersistedServiceTypes({
            serviceType: 'Yenidoğan çekimi',
            services: ['Hamile çekimi'],
            customerMessages: ['Merhaba']
        })

        expect(services).toEqual([])
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

    it('excludes whatsapp media-only placeholder messages and keeps text-only turns', () => {
        const result = buildLeadExtractionConversationContext({
            messages: [
                {
                    sender_type: 'contact',
                    content: '[WhatsApp image]',
                    metadata: {
                        whatsapp_message_type: 'image',
                        whatsapp_media: {
                            type: 'image',
                            storage_url: 'https://cdn.example.com/media-1.jpg'
                        }
                    }
                },
                {
                    sender_type: 'contact',
                    content: 'Fiyat alabilir miyim?',
                    metadata: {
                        whatsapp_message_type: 'text'
                    }
                },
                {
                    sender_type: 'bot',
                    content: 'Tabii, hangi hizmet için?'
                }
            ]
        })

        expect(result.conversationTurns).toEqual([
            'assistant: Tabii, hangi hizmet için?',
            'customer: Fiyat alabilir miyim?'
        ])
        expect(result.customerMessages).toEqual(['Fiyat alabilir miyim?'])
    })

    it('keeps caption text from whatsapp media messages in extraction context', () => {
        const result = buildLeadExtractionConversationContext({
            messages: [
                {
                    sender_type: 'contact',
                    content: 'Bunun fiyatını öğrenebilir miyim?',
                    metadata: {
                        whatsapp_message_type: 'image',
                        whatsapp_media: {
                            type: 'image',
                            storage_url: 'https://cdn.example.com/media-2.jpg',
                            caption: 'Bunun fiyatını öğrenebilir miyim?'
                        }
                    }
                },
                {
                    sender_type: 'bot',
                    content: 'Tabii, hangi paket için bilgi istersiniz?'
                }
            ]
        })

        expect(result.conversationTurns).toEqual([
            'assistant: Tabii, hangi paket için bilgi istersiniz?',
            'customer: Bunun fiyatını öğrenebilir miyim?'
        ])
        expect(result.customerMessages).toEqual(['Bunun fiyatını öğrenebilir miyim?'])
    })

    it('uses instagram media caption when content falls back to a placeholder label', () => {
        const result = buildLeadExtractionConversationContext({
            messages: [
                {
                    sender_type: 'contact',
                    content: '[Instagram image]',
                    metadata: {
                        instagram_event_type: 'attachment',
                        instagram_media: {
                            type: 'image',
                            storage_url: 'https://cdn.example.com/instagram-media-1.jpg',
                            caption: 'Merhaba, bunun hakkında daha fazla bilgi alabilir miyim?'
                        }
                    }
                },
                {
                    sender_type: 'bot',
                    content: 'Tabii, size yardımcı olayım.'
                }
            ]
        })

        expect(result.conversationTurns).toEqual([
            'assistant: Tabii, size yardımcı olayım.',
            'customer: Merhaba, bunun hakkında daha fazla bilgi alabilir miyim?'
        ])
        expect(result.customerMessages).toEqual([
            'Merhaba, bunun hakkında daha fazla bilgi alabilir miyim?'
        ])
    })
})

describe('normalizeLowSignalLeadStatus', () => {
    it('marks greeting-only conversations as cold', () => {
        const result = normalizeLowSignalLeadStatus({
            extracted: safeParseLeadExtraction('{"score": 4, "status": "cold", "service_type": null, "summary": "Selamlaştı"}'),
            customerMessages: ['merhaba']
        })

        expect(result.status).toBe('cold')
        expect(result.score).toBe(2)
    })

    it('keeps status when customer intent is explicit', () => {
        const result = normalizeLowSignalLeadStatus({
            extracted: safeParseLeadExtraction('{"score": 7, "status": "warm", "intent_signals": ["decisive"], "summary": "Randevu almak istiyor"}'),
            customerMessages: ['Merhaba, randevu olmak istiyorum.']
        })

        expect(result.status).toBe('warm')
        expect(result.score).toBe(7)
    })

    it('normalizes non_business greeting-only outputs to cold', () => {
        const result = normalizeLowSignalLeadStatus({
            extracted: safeParseLeadExtraction('{"score": 0, "status": "ignored", "non_business": true, "summary": "Sadece selam verdi"}'),
            customerMessages: ['hello', 'merhaba']
        })

        expect(result.non_business).toBe(false)
        expect(result.status).toBe('cold')
        expect(result.score).toBe(0)
    })
})
