import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const {
    openAiCreateMock,
    recordAiUsageMock,
    resolveOrganizationUsageEntitlementMock
} = vi.hoisted(() => ({
    openAiCreateMock: vi.fn(),
    recordAiUsageMock: vi.fn(),
    resolveOrganizationUsageEntitlementMock: vi.fn()
}))

vi.mock('openai', () => ({
    default: class OpenAIMock {
        chat = {
            completions: {
                create: openAiCreateMock
            }
        }
    }
}))

vi.mock('@/lib/ai/usage', () => ({
    recordAiUsage: recordAiUsageMock
}))

vi.mock('@/lib/billing/entitlements', () => ({
    resolveOrganizationUsageEntitlement: resolveOrganizationUsageEntitlementMock
}))

import {
    appendOfferingProfileSuggestion,
    generateInitialOfferingSuggestion
} from '@/lib/leads/offering-profile'

type QueryBuilder = Record<string, unknown>

const originalOpenAiKey = process.env.OPENAI_API_KEY

function createSupabaseMock(plan: Record<string, QueryBuilder[]>) {
    return {
        from: vi.fn((table: string) => {
            const queue = plan[table]
            if (!queue || queue.length === 0) {
                throw new Error(`Unexpected query for table: ${table}`)
            }
            const next = queue.shift()
            if (!next) {
                throw new Error(`Missing query builder for table: ${table}`)
            }
            return next
        })
    }
}

function createOfferingProfileBuilder(profile: {
    summary: string
    ai_suggestions_enabled: boolean
    ai_suggestions_locale: 'tr' | 'en'
}) {
    const builder: QueryBuilder = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => ({ data: profile, error: null }))
    return builder
}

function createSuggestionListBuilder(rows: Array<{ id?: string; content?: string }>) {
    const builder: QueryBuilder = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.is = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.limit = vi.fn(async () => ({ data: rows, error: null }))
    return builder
}

function createOrderedListBuilder<T>(rows: T[]) {
    const builder: QueryBuilder = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.limit = vi.fn(async () => ({ data: rows, error: null }))
    return builder
}

function createInsertBuilder(error: { message: string } | null = null) {
    const insertMock = vi.fn(async () => ({ error }))
    return {
        builder: {
            insert: insertMock
        },
        insertMock
    }
}

function buildCompletionPayload(suggestion: string) {
    return {
        choices: [{ message: { content: JSON.stringify({ suggestion, update_index: null }) } }],
        usage: { prompt_tokens: 30, completion_tokens: 40, total_tokens: 70 }
    }
}

describe('appendOfferingProfileSuggestion detail repair flow', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        process.env.OPENAI_API_KEY = 'test-key'
        resolveOrganizationUsageEntitlementMock.mockResolvedValue({
            isUsageAllowed: true,
            membershipState: 'active',
            lockReason: null
        })
    })

    afterAll(() => {
        if (typeof originalOpenAiKey === 'undefined') {
            delete process.env.OPENAI_API_KEY
            return
        }
        process.env.OPENAI_API_KEY = originalOpenAiKey
    })

    it('rejects suggestion when repair output is still terse', async () => {
        const shortSuggestion = [
            'Klinik temel dis hekimligi hizmeti sunar.',
            '- Sunulanlar: Muayene, dolgu.',
            '- Sunulmayanlar: Gece nobeti yok.',
            '- Koşullar: Fiyat muayene sonrasi.'
        ].join('\n')

        openAiCreateMock
            .mockResolvedValueOnce(buildCompletionPayload(shortSuggestion))
            .mockResolvedValueOnce(buildCompletionPayload(shortSuggestion))
            .mockResolvedValueOnce(buildCompletionPayload(shortSuggestion))

        const insert = createInsertBuilder()
        const supabase = createSupabaseMock({
            offering_profiles: [
                createOfferingProfileBuilder({
                    summary: '',
                    ai_suggestions_enabled: true,
                    ai_suggestions_locale: 'tr'
                })
            ],
            offering_profile_suggestions: [
                createSuggestionListBuilder([]),
                createSuggestionListBuilder([]),
                insert.builder
            ]
        })

        const result = await appendOfferingProfileSuggestion({
            organizationId: 'org-1',
            sourceType: 'knowledge',
            sourceId: 'doc-1',
            content: 'Yeni dokuman icerigi',
            supabase: supabase as never
        })

        expect(result).toBeNull()
        expect(openAiCreateMock).toHaveBeenCalledTimes(3)
        expect(insert.insertMock).not.toHaveBeenCalled()
    })

    it('accepts repaired suggestion when detail threshold is met', async () => {
        const shortSuggestion = [
            'Klinik temel dis hekimligi hizmeti sunar.',
            '- Sunulanlar: Muayene, dolgu.',
            '- Sunulmayanlar: Gece nobeti yok.',
            '- Koşullar: Fiyat muayene sonrasi.'
        ].join('\n')

        const repairedSuggestion = [
            'Klinik, estetik ve tedavi odakli dis hekimligi hizmetlerini planli randevu akisiyla sunar.',
            '- Sunulanlar: Implant, ortodonti, kanal tedavisi ve dis beyazlatma hizmetleri hasta ihtiyacina gore muayene sonrasi asamali olarak planlanir.',
            '- Sunulmayanlar: Genel anestezi altinda buyuk cerrahi islemler, evde tedavi ve 7/24 acil nobet kapsami bu merkezde verilmez.',
            '- Koşullar: Kesin tedavi plani ile fiyatlandirma ilk muayene ve gerekli goruntuleme sonrasinda hekim degerlendirmesiyle netlestirilir.'
        ].join('\n')

        openAiCreateMock
            .mockResolvedValueOnce(buildCompletionPayload(shortSuggestion))
            .mockResolvedValueOnce(buildCompletionPayload(repairedSuggestion))

        const insert = createInsertBuilder()
        const supabase = createSupabaseMock({
            offering_profiles: [
                createOfferingProfileBuilder({
                    summary: '',
                    ai_suggestions_enabled: true,
                    ai_suggestions_locale: 'tr'
                })
            ],
            offering_profile_suggestions: [
                createSuggestionListBuilder([]),
                createSuggestionListBuilder([]),
                insert.builder
            ]
        })

        const result = await appendOfferingProfileSuggestion({
            organizationId: 'org-1',
            sourceType: 'knowledge',
            sourceId: 'doc-1',
            content: 'Yeni dokuman icerigi',
            supabase: supabase as never
        })

        expect(result).toBe(repairedSuggestion)
        expect(openAiCreateMock).toHaveBeenCalledTimes(2)
        expect(insert.insertMock).toHaveBeenCalledTimes(1)
        expect(insert.insertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                organization_id: 'org-1',
                source_type: 'knowledge',
                source_id: 'doc-1',
                content: repairedSuggestion,
                status: 'pending',
                locale: 'tr'
            })
        )
    })

    it('retries with a stricter repair prompt when the first repair is still terse', async () => {
        const terseSuggestion = 'İşletmemiz, yeni doğal fotoğrafçılık hizmeti sunmaktadır.'

        const repairedSuggestion = [
            'İşletme, yenidoğan, hamile ve bir yaş çekimlerini planlı randevu akışıyla stüdyo ortamında sunar.',
            '- Sunulanlar: Yenidoğan çekimleri bebek doğduktan sonraki ilk 5 ila 15 gün içinde, hamile çekimleri ve bir yaş çekimleri ise içerikte belirtilen planlı stüdyo akışıyla sunulur.',
            '- Koşullar: Randevu için bebeğin beklenen doğum tarihinin yaklaşık 40. haftasını bilmek yeterlidir; bebek doğduktan sonra gününe ve müsaitliğe göre uygun slot değerlendirilir.',
            '- Koşullar: Fiyat bilgisi, bebeğin doğup doğmadığı veya yaklaşık doğum haftası netleştikten sonra paylaşılır ve pazarlık yapılmaz.',
            '- Koşullar: Yazışmalarda sıcak, samimi ve cinsiyet ayrımı yapmayan nötr bir iletişim dili tercih edilir; emoji kullanımı ölçülü tutulur.'
        ].join('\n')

        openAiCreateMock
            .mockResolvedValueOnce(buildCompletionPayload(terseSuggestion))
            .mockResolvedValueOnce(buildCompletionPayload(terseSuggestion))
            .mockResolvedValueOnce(buildCompletionPayload(repairedSuggestion))

        const insert = createInsertBuilder()
        const supabase = createSupabaseMock({
            offering_profiles: [
                createOfferingProfileBuilder({
                    summary: '',
                    ai_suggestions_enabled: true,
                    ai_suggestions_locale: 'tr'
                })
            ],
            offering_profile_suggestions: [
                createSuggestionListBuilder([]),
                createSuggestionListBuilder([]),
                insert.builder
            ]
        })

        const result = await appendOfferingProfileSuggestion({
            organizationId: 'org-1',
            sourceType: 'knowledge',
            sourceId: 'doc-1',
            content: 'Yeni dokuman icerigi',
            supabase: supabase as never
        })

        expect(result).toBe(repairedSuggestion)
        expect(openAiCreateMock).toHaveBeenCalledTimes(3)
        expect(insert.insertMock).toHaveBeenCalledTimes(1)
    })

    it('throws when inserting a valid suggestion fails', async () => {
        const detailedSuggestion = [
            'Klinik, estetik ve tedavi odakli dis hekimligi hizmetlerini planli randevu akisiyla sunar.',
            '- Sunulanlar: Implant, ortodonti, kanal tedavisi ve dis beyazlatma hizmetleri hasta ihtiyacina gore muayene sonrasi asamali olarak planlanir.',
            '- Sunulmayanlar: Genel anestezi altinda buyuk cerrahi islemler, evde tedavi ve 7/24 acil nobet kapsami bu merkezde verilmez.',
            '- Koşullar: Kesin tedavi plani ile fiyatlandirma ilk muayene ve gerekli goruntuleme sonrasinda hekim degerlendirmesiyle netlestirilir.'
        ].join('\n')

        openAiCreateMock.mockResolvedValueOnce(buildCompletionPayload(detailedSuggestion))

        const insert = createInsertBuilder({ message: 'insert failed' })
        const supabase = createSupabaseMock({
            offering_profiles: [
                createOfferingProfileBuilder({
                    summary: '',
                    ai_suggestions_enabled: true,
                    ai_suggestions_locale: 'tr'
                })
            ],
            offering_profile_suggestions: [
                createSuggestionListBuilder([]),
                createSuggestionListBuilder([]),
                insert.builder
            ]
        })

        await expect(
            appendOfferingProfileSuggestion({
                organizationId: 'org-1',
                sourceType: 'knowledge',
                sourceId: 'doc-1',
                content: 'Yeni dokuman icerigi',
                supabase: supabase as never
            })
        ).rejects.toThrow('Failed to insert offering profile suggestion: insert failed')
    })
})

describe('generateInitialOfferingSuggestion source richness', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        process.env.OPENAI_API_KEY = 'test-key'
        resolveOrganizationUsageEntitlementMock.mockResolvedValue({
            isUsageAllowed: true,
            membershipState: 'active',
            lockReason: null
        })
    })

    it('includes knowledge document content instead of only titles for batch suggestions', async () => {
        const detailedSuggestion = [
            'İşletme, yenidoğan ve hamile odaklı fotoğraf çekimlerini planlı randevu akışıyla sunar.',
            '- Sunulanlar: Yenidoğan çekimleri doğumdan sonraki ilk 5 ila 15 gün içinde, hamile çekimleri ve bir yaş çekimleri stüdyo ortamında gerçekleştirilir.',
            '- Koşullar: Randevu planlamasında bebeğin yaklaşık doğum haftası ve doğum sonrası gün bilgisi dikkate alınır.',
            '- Koşullar: Fiyat bilgisi bebek durumu netleştikten sonra paylaşılır ve pazarlık yapılmaz.'
        ].join('\n')

        openAiCreateMock.mockResolvedValueOnce(buildCompletionPayload(detailedSuggestion))

        const insert = createInsertBuilder()
        const supabase = createSupabaseMock({
            offering_profiles: [
                createOfferingProfileBuilder({
                    summary: '',
                    ai_suggestions_enabled: true,
                    ai_suggestions_locale: 'tr'
                }),
                createOfferingProfileBuilder({
                    summary: '',
                    ai_suggestions_enabled: true,
                    ai_suggestions_locale: 'tr'
                })
            ],
            offering_profile_suggestions: [
                createSuggestionListBuilder([]),
                createSuggestionListBuilder([]),
                createSuggestionListBuilder([]),
                insert.builder
            ],
            skills: [
                createOrderedListBuilder([
                    {
                        title: 'Randevu Bilgisi',
                        trigger_examples: 'Randevu nasıl alınır?',
                        response_text: 'Doğum haftası bilgisiyle planlama yapılır.'
                    }
                ])
            ],
            knowledge_documents: [
                createOrderedListBuilder([
                    {
                        title: 'Yeni Doğal Fotoğrafçılık Bilgileri',
                        content: 'Bebek fotoğrafçılığı doğumdan sonraki ilk 5 ila 15 gün arasında yapılır. Hamile çekimleri stüdyo ortamında sunulur.',
                        status: 'ready'
                    }
                ])
            ]
        })

        const result = await generateInitialOfferingSuggestion({
            organizationId: 'org-1',
            supabase: supabase as never,
            skipExistingCheck: false
        })

        expect(result).toBe(detailedSuggestion)

        const firstCallArgs = openAiCreateMock.mock.calls[0]?.[0]
        const userMessage = firstCallArgs?.messages?.find(
            (message: { role?: string; content?: string }) => message.role === 'user'
        )

        expect(userMessage?.content).toContain('Bebek fotoğrafçılığı doğumdan sonraki ilk 5 ila 15 gün arasında yapılır.')
        expect(userMessage?.content).toContain('Doğum haftası bilgisiyle planlama yapılır.')
        expect(userMessage?.content).not.toContain('Knowledge Base:\n- Yeni Doğal Fotoğrafçılık Bilgileri')
    })
})
