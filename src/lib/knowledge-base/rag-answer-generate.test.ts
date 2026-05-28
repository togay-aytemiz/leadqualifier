import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-generate'

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

describe('generateGroundedRagAnswer', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('uses organization voice while requiring exact support evidence from retrieved chunks', async () => {
        const createCompletion = vi.fn(async (args: Record<string, unknown>) => {
            const messages = args.messages as Array<{ role: string; content: string }>
            const systemPrompt = messages.find((message) => message.role === 'system')?.content ?? ''

            expect(systemPrompt).toContain('Samimi, canlı ve güven veren bir dil kullan.')
            expect(systemPrompt).toContain('organization-specific AI assistant instructions above as the voice and behavior contract')
            expect(systemPrompt).toContain('support_quotes')
            expect(systemPrompt).toContain('Do not answer from memory')

            return {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            answer: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; süresi 20 iş günü.',
                            support_quotes: ['Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.'],
                            engagement_question: 'İstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.',
                            engagement_evidence: 'Staj uygulamasına ilişkin dönem ve başvuru koşulları program dokümanında açıklanır.'
                        })
                    }
                }],
                usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 }
            }
        })

        const result = await generateGroundedRagAnswer({
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks,
            settings: {
                prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
                bot_name: 'Qualy'
            },
            createCompletion
        })

        expect(result).toMatchObject({
            answer: [
                'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; süresi 20 iş günü.',
                '',
                'İstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.'
            ].join('\n'),
            usedGeneration: true,
            addedEngagement: true,
            model: 'gpt-4o-mini',
            usage: { inputTokens: 120, outputTokens: 45, totalTokens: 165 }
        })
    })

    it('rejects generated answers when the support quote is not present in the context', async () => {
        const createCompletion = vi.fn(async () => ({
            choices: [{
                message: {
                    content: JSON.stringify({
                        answer: 'Evet, bu programda yaz stajı var.',
                        support_quotes: ['Bu programda yaz stajı hastanede yapılır.'],
                        engagement_question: '',
                        engagement_evidence: ''
                    })
                }
            }],
            usage: { prompt_tokens: 90, completion_tokens: 25, total_tokens: 115 }
        }))

        const result = await generateGroundedRagAnswer({
            userMessage: 'Bu programda yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks,
            createCompletion
        })

        expect(result.usedGeneration).toBe(false)
        expect(result.answer).toBe('')
        expect(result.usage).toEqual({ inputTokens: 90, outputTokens: 25, totalTokens: 115 })
    })

    it('rejects generated answers that introduce critical values not found in retrieved evidence', async () => {
        const createCompletion = vi.fn(async () => ({
            choices: [{
                message: {
                    content: JSON.stringify({
                        answer: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; süresi 30 iş günü.',
                        support_quotes: ['Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.'],
                        engagement_question: '',
                        engagement_evidence: ''
                    })
                }
            }],
            usage: { prompt_tokens: 90, completion_tokens: 25, total_tokens: 115 }
        }))

        const result = await generateGroundedRagAnswer({
            userMessage: 'Bu programda yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks,
            createCompletion
        })

        expect(result.usedGeneration).toBe(false)
        expect(result.answer).toBe('')
    })

    it('keeps the answer but drops engagement when engagement evidence is unsupported', async () => {
        const createCompletion = vi.fn(async () => ({
            choices: [{
                message: {
                    content: JSON.stringify({
                        answer: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; süresi 20 iş günü.',
                        support_quotes: ['Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.'],
                        engagement_question: 'İstersen staj ücretini de gösterebilirim.',
                        engagement_evidence: 'Staj ücreti kurum tarafından ayrıca ilan edilir.'
                    })
                }
            }],
            usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 }
        }))

        const result = await generateGroundedRagAnswer({
            userMessage: 'Bu programda yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks,
            createCompletion
        })

        expect(result.answer).toBe('Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; süresi 20 iş günü.')
        expect(result.usedGeneration).toBe(true)
        expect(result.addedEngagement).toBe(false)
    })
})
