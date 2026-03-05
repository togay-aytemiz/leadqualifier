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

import { appendOfferingProfileSuggestion } from '@/lib/leads/offering-profile'

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

function createInsertBuilder() {
    const insertMock = vi.fn(async () => ({ error: null }))
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
        vi.clearAllMocks()
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
        expect(openAiCreateMock).toHaveBeenCalledTimes(2)
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
})
