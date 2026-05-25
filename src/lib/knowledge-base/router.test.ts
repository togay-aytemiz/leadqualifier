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

import { decideKnowledgeBaseRoute } from '@/lib/knowledge-base/router'

describe('decideKnowledgeBaseRoute', () => {
    const originalOpenAiKey = process.env.OPENAI_API_KEY

    beforeEach(() => {
        process.env.OPENAI_API_KEY = 'test-key'
        createCompletionMock.mockReset()
    })

    afterEach(() => {
        process.env.OPENAI_API_KEY = originalOpenAiKey
    })

    it('forces KB routing for Turkish capability questions even when the LLM router says no', async () => {
        createCompletionMock.mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        route_to_kb: false,
                        rewritten_query: '',
                        reason: 'general_capability_question'
                    })
                }
            }],
            usage: {
                prompt_tokens: 12,
                completion_tokens: 6,
                total_tokens: 18
            }
        })

        const decision = await decideKnowledgeBaseRoute(
            'Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilir miyim',
            []
        )

        expect(decision).toMatchObject({
            route_to_kb: true,
            rewritten_query: 'Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilir miyim'
        })
        expect(decision.reason).toContain('heuristic_question')
    })
})
