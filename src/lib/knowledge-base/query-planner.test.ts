import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createCompletionMock } = vi.hoisted(() => ({
    createCompletionMock: vi.fn()
}))

vi.mock('openai', () => ({
    default: vi.fn().mockImplementation(function OpenAI() {
        return {
            chat: {
                completions: {
                    create: createCompletionMock
                }
            }
        }
    })
}))

import {
    planKnowledgeSearchQuery,
    shouldPlanKnowledgeSearchQuery
} from '@/lib/knowledge-base/query-planner'

describe('knowledge query planner', () => {
    const originalOpenAiKey = process.env.OPENAI_API_KEY
    const originalPlannerEnabled = process.env.KNOWLEDGE_QUERY_PLANNER_ENABLED
    const originalPlannerModel = process.env.OPENAI_QUERY_PLANNER_MODEL
    const originalPlannerTimeout = process.env.KNOWLEDGE_QUERY_PLANNER_TIMEOUT_MS

    beforeEach(() => {
        process.env.OPENAI_API_KEY = 'test-openai-key'
        process.env.KNOWLEDGE_QUERY_PLANNER_ENABLED = 'always'
        delete process.env.OPENAI_QUERY_PLANNER_MODEL
        delete process.env.KNOWLEDGE_QUERY_PLANNER_TIMEOUT_MS
        createCompletionMock.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
        process.env.OPENAI_API_KEY = originalOpenAiKey
        process.env.KNOWLEDGE_QUERY_PLANNER_ENABLED = originalPlannerEnabled
        process.env.OPENAI_QUERY_PLANNER_MODEL = originalPlannerModel
        process.env.KNOWLEDGE_QUERY_PLANNER_TIMEOUT_MS = originalPlannerTimeout
    })

    it('returns normalized retrieval variants from JSON without answer facts', async () => {
        createCompletionMock.mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        intent: 'policy_lookup',
                        subject: 'Tıbbi Laboratuvar Teknikleri',
                        search_queries: [
                            'Tıbbi Laboratuvar Teknikleri yaz stajı',
                            'TLT zorunlu yaz stajı var mı?',
                            'Tıbbi Laboratuvar Teknikleri yaz stajı'
                        ],
                        must_have_terms: ['staj', 'Tıbbi Laboratuvar Teknikleri', 'staj'],
                        answer: 'Bu cevap kullanılmamalı'
                    })
                }
            }],
            usage: {
                prompt_tokens: 44,
                completion_tokens: 18,
                total_tokens: 62
            }
        })

        const plan = await planKnowledgeSearchQuery('Bu programda yaz stajı var mı?', [{
            role: 'assistant',
            content: 'Tıbbi Laboratuvar Teknikleri hakkında konuşuyorduk.'
        }])

        expect(plan).toMatchObject({
            enabled: true,
            model: 'gpt-4o-mini',
            reason: 'planned'
        })
        expect(plan.searchQueries).toEqual([
            'Bu programda yaz stajı var mı?',
            'Tıbbi Laboratuvar Teknikleri yaz stajı',
            'TLT zorunlu yaz stajı var mı?'
        ])
        expect(plan.mustHaveTerms).toEqual(['staj', 'Tıbbi Laboratuvar Teknikleri'])
        expect(plan.usage).toEqual({
            inputTokens: 44,
            outputTokens: 18,
            totalTokens: 62
        })
        expect(JSON.stringify(plan)).not.toContain('Bu cevap kullanılmamalı')
        expect(createCompletionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gpt-4o-mini',
                response_format: { type: 'json_object' }
            }),
            expect.objectContaining({
                timeout: 2500,
                maxRetries: 0
            })
        )
    })

    it('does not call OpenAI when planning is disabled', async () => {
        process.env.KNOWLEDGE_QUERY_PLANNER_ENABLED = 'false'

        const plan = await planKnowledgeSearchQuery('SBF kampüsü nerede?')

        expect(plan).toMatchObject({
            enabled: false,
            reason: 'disabled',
            searchQueries: ['SBF kampüsü nerede?'],
            mustHaveTerms: []
        })
        expect(createCompletionMock).not.toHaveBeenCalled()
    })

    it('falls back to the original query when planner JSON is invalid', async () => {
        createCompletionMock.mockResolvedValue({
            choices: [{
                message: {
                    content: 'not json'
                }
            }],
            usage: {
                prompt_tokens: 20,
                completion_tokens: 3,
                total_tokens: 23
            }
        })

        const plan = await planKnowledgeSearchQuery('Finale girmeden bütünlemeye girebilir miyim?')

        expect(plan).toMatchObject({
            enabled: true,
            reason: 'planner_error',
            searchQueries: ['Finale girmeden bütünlemeye girebilir miyim?'],
            mustHaveTerms: []
        })
        expect(plan.usage).toEqual({
            inputTokens: 20,
            outputTokens: 3,
            totalTokens: 23
        })
    })

    it('falls back to the original query when planner work exceeds its latency budget', async () => {
        vi.useFakeTimers()
        createCompletionMock.mockImplementationOnce(() => new Promise(() => undefined))

        const planPromise = planKnowledgeSearchQuery('SBF kampüsü nerede?')
        await vi.advanceTimersByTimeAsync(2501)
        const plan = await planPromise

        expect(plan).toMatchObject({
            enabled: true,
            reason: 'planner_error',
            searchQueries: ['SBF kampüsü nerede?'],
            mustHaveTerms: []
        })
    })

    it('auto plans noisy, abbreviated, and policy-like questions but skips short generic questions', () => {
        expect(shouldPlanKnowledgeSearchQuery('SBF kampüsü nerede?')).toBe(true)
        expect(shouldPlanKnowledgeSearchQuery('Merhaba, hızlıca sorayım; bu programda yaz stajı var mı acaba?')).toBe(true)
        expect(shouldPlanKnowledgeSearchQuery('Finale girmeden bütünlemeye girebilir miyim?')).toBe(true)
        expect(shouldPlanKnowledgeSearchQuery('Paket fiyatı nedir?')).toBe(false)
    })
})
