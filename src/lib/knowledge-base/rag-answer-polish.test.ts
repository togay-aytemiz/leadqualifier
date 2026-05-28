import { afterEach, describe, expect, it, vi } from 'vitest'
import { polishGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-polish'

const chunks = [
    {
        content: [
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
            'Staj uygulamasına ilişkin dönem ve başvuru koşulları program dokümanında açıklanır.'
        ].join('\n'),
        document_id: 'doc-tlt',
        document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
        source_url: 'https://example.edu.tr/tlt.pdf'
    }
]

describe('polishGroundedRagAnswer', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('adds a source-grounded engagement question selected by the model', async () => {
        const createCompletion = vi.fn(async () => ({
            choices: [{
                message: {
                    content: JSON.stringify({
                        answer: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; staj süresi 20 iş günü.',
                        engagement_question: 'İstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.',
                        engagement_evidence: 'Staj uygulamasına ilişkin dönem ve başvuru koşulları program dokümanında açıklanır.'
                    })
                }
            }],
            usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 }
        }))

        const result = await polishGroundedRagAnswer({
            answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks,
            settings: {
                prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
                bot_name: 'Qualy'
            },
            createCompletion
        })

        expect(result.answer).toBe(
            'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; staj süresi 20 iş günü.\n\nİstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.'
        )
        expect(result.addedEngagement).toBe(true)
        expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 45, totalTokens: 165 })
    })

    it('drops model engagement when the evidence quote is not present in the retrieved chunks', async () => {
        const createCompletion = vi.fn(async () => ({
            choices: [{
                message: {
                    content: JSON.stringify({
                        answer: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; staj süresi 20 iş günü.',
                        engagement_question: 'İstersen staj ücretinin ne kadar olduğunu da gösterebilirim.',
                        engagement_evidence: 'Staj ücreti kurum tarafından ayrıca ilan edilir.'
                    })
                }
            }],
            usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 }
        }))

        const result = await polishGroundedRagAnswer({
            answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks,
            settings: {
                prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
                bot_name: 'Qualy'
            },
            createCompletion
        })

        expect(result.answer).toBe('Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; staj süresi 20 iş günü.')
        expect(result.addedEngagement).toBe(false)
    })

    it('falls back to the original answer when polish drops critical factual values', async () => {
        const createCompletion = vi.fn(async () => ({
            choices: [{
                message: {
                    content: JSON.stringify({
                        answer: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var.',
                        engagement_question: '',
                        engagement_evidence: ''
                    })
                }
            }],
            usage: { prompt_tokens: 90, completion_tokens: 20, total_tokens: 110 }
        }))

        const result = await polishGroundedRagAnswer({
            answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks,
            settings: {
                prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
                bot_name: 'Qualy'
            },
            createCompletion
        })

        expect(result.answer).toBe('Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.')
        expect(result.usedPolish).toBe(false)
    })

    it('aborts timed-out polish calls before falling back to the original answer', async () => {
        vi.stubEnv('AI_REQUEST_TIMEOUT_MS', '5')
        let aborted = false
        const createCompletion = vi.fn((_args: Record<string, unknown>, options?: { signal?: AbortSignal }) => (
            new Promise<never>((_resolve, reject) => {
                options?.signal?.addEventListener('abort', () => {
                    aborted = true
                    reject(new Error('aborted'))
                })
            })
        ))

        const result = await polishGroundedRagAnswer({
            answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks,
            settings: {
                prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
                bot_name: 'Qualy'
            },
            createCompletion
        })

        expect(aborted).toBe(true)
        expect(result.answer).toBe('Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.')
        expect(result.usedPolish).toBe(false)
    })
})
