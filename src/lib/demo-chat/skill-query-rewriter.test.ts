import { describe, expect, it, vi } from 'vitest'

import { rewriteDemoSkillQuery } from './skill-query-rewriter'

describe('rewriteDemoSkillQuery', () => {
    it('rewrites long acceptance messages to the assistant previous offer', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        query: 'Yüksek İhtisas Üniversitesi burs seçenekleri',
                        used_history: true,
                        decision: 'accepted_previous_offer',
                        reason: 'User accepted the assistant offer to explain burs options.',
                    }),
                },
            }],
            usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        })

        const result = await rewriteDemoSkillQuery({
            latestUserMessage: 'Evet, lütfen devam etmeni rica ediyorum.',
            responseLanguage: 'tr',
            organizationContext: 'YİÜ Tanıtım Günleri 2026',
            recentMessages: [
                {
                    role: 'assistant',
                    content: 'İstersen burs seçeneklerini de anlatabilirim.',
                },
            ],
            createCompletion,
        })

        expect(result).toMatchObject({
            query: 'Yüksek İhtisas Üniversitesi burs seçenekleri',
            usedHistory: true,
            decision: 'accepted_previous_offer',
            model: 'gpt-4.1-mini',
            usage: { totalTokens: 120 },
        })
        expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({
            temperature: 0,
            response_format: { type: 'json_object' },
        }))
        const request = createCompletion.mock.calls[0]?.[0] as {
            messages: Array<{ role: string; content: string }>
        }
        expect(request.messages[0]?.content).toContain(
            'Use assistant behavior/scope instructions only to identify the active organization'
        )
        expect(request.messages[0]?.content).toContain(
            'Do not convert the request into a nearby Skill topic'
        )
    })

    it('passes assistant task instructions as scope context instead of answer evidence', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        query: 'Yüksek İhtisas Üniversitesi kampüsleri nerede?',
                        subject: 'Yüksek İhtisas Üniversitesi kampüsleri',
                        facet: 'konum',
                        needs_clarification: false,
                        used_history: false,
                        decision: 'standalone',
                        reason: 'The assistant scope identifies the active university.',
                    }),
                },
            }],
        })

        await rewriteDemoSkillQuery({
            latestUserMessage: 'kampüsler nerede',
            responseLanguage: 'tr',
            organizationContext: 'Yüksek İhtisas Üniversitesi / YIU Demo',
            assistantInstructionContext:
                'Assistant name: YİÜ Tanıtım Asistanı\nAssistant task/scope instructions: Yüksek İhtisas Üniversitesi Tanıtım Günleri aday öğrenci asistanı gibi konuş.',
            recentMessages: [],
            createCompletion,
        })

        const request = createCompletion.mock.calls[0]?.[0] as {
            messages: Array<{ role: string; content: string }>
        }
        expect(request.messages[1]?.content).toContain(
            'Organization context:\nYüksek İhtisas Üniversitesi / YIU Demo'
        )
        expect(request.messages[1]?.content).toContain(
            'Assistant task/scope instructions: Yüksek İhtisas Üniversitesi Tanıtım Günleri'
        )
    })

    it('passes editable dictionary context as alias help, not answer evidence', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        query: 'Fizyoterapi ve Rehabilitasyon ücreti',
                        subject: 'Fizyoterapi ve Rehabilitasyon',
                        facet: 'ücret',
                        needs_clarification: false,
                        used_history: false,
                        decision: 'standalone',
                        reason: 'The dictionary expands ftr.',
                    }),
                },
            }],
        })

        await rewriteDemoSkillQuery({
            latestUserMessage: 'ftr ücreti nedir?',
            responseLanguage: 'tr',
            organizationContext: 'Yüksek İhtisas Üniversitesi',
            dictionaryContext: 'ftr => Fizyoterapi ve Rehabilitasyon | Fizyoterapi ön lisans',
            recentMessages: [],
            createCompletion,
        })

        const request = createCompletion.mock.calls[0]?.[0] as {
            messages: Array<{ role: string; content: string }>
        }
        expect(request.messages[0]?.content).toContain(
            'Use the organization dictionary only to understand aliases'
        )
        expect(request.messages[0]?.content).toContain(
            'If a dictionary term has multiple meanings, choose from message and history context'
        )
        expect(request.messages[1]?.content).toContain(
            'Organization dictionary:\nftr => Fizyoterapi ve Rehabilitasyon | Fizyoterapi ön lisans'
        )
    })

    it('combines a missing slot answer with the previous requested fact', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        query: 'Hemşirelik ücret, kontenjan ve taban puan bilgileri',
                        used_history: true,
                        decision: 'accepted_previous_offer',
                        reason: 'User supplied the program after the assistant asked which program.',
                    }),
                },
            }],
        })

        const result = await rewriteDemoSkillQuery({
            latestUserMessage: 'Hemşirelik',
            responseLanguage: 'tr',
            recentMessages: [
                { role: 'user', content: 'Programların ücret ve kontenjanlarını öğrenebilir miyim?' },
                { role: 'assistant', content: 'Hangi programı düşündüğünü söylersen net satırı paylaşabilirim.' },
            ],
            createCompletion,
        })

        expect(result?.query).toBe('Hemşirelik ücret, kontenjan ve taban puan bilgileri')
        expect(result?.usedHistory).toBe(true)
    })

    it('returns the clarification question and missing slots for an underspecified request', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        query: 'Yüksek İhtisas Üniversitesi ücret bilgisi',
                        subject: '',
                        facet: 'ücret',
                        needs_clarification: true,
                        clarification_question: 'Hangi programın ücretini öğrenmek istiyorsunuz?',
                        missing_slots: ['subject'],
                        used_history: false,
                        decision: 'unresolved',
                        reason: 'The requested program is missing.',
                    }),
                },
            }],
        })

        const result = await rewriteDemoSkillQuery({
            latestUserMessage: 'ücreti ne kadar?',
            responseLanguage: 'tr',
            recentMessages: [],
            createCompletion,
        })

        expect(result).toMatchObject({
            needsClarification: true,
            clarificationQuestion: 'Hangi programın ücretini öğrenmek istiyorsunuz?',
            missingSlots: ['subject'],
        })

        const request = createCompletion.mock.calls[0]?.[0] as {
            messages: Array<{ role: string; content: string }>
        }
        expect(request.messages[0]?.content).toContain('clarification_question')
        expect(request.messages[0]?.content).toContain('missing_slots')
    })

    it('preserves standalone questions without requiring history use', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        query: 'Tıp Fakültesi ücreti ne kadar?',
                        subject: 'Tıp Fakültesi',
                        facet: 'ücret',
                        needs_clarification: false,
                        used_history: false,
                        decision: 'standalone',
                        reason: 'Latest message is already a complete question.',
                    }),
                },
            }],
        })

        const result = await rewriteDemoSkillQuery({
            latestUserMessage: 'Tıp Fakültesi ücreti ne kadar?',
            responseLanguage: 'tr',
            recentMessages: [],
            createCompletion,
        })

        expect(result).toMatchObject({
            query: 'Tıp Fakültesi ücreti ne kadar?',
            subject: 'Tıp Fakültesi',
            facet: 'ücret',
            needsClarification: false,
            usedHistory: false,
            decision: 'standalone',
        })
    })

    it('fails open when there is no history and no injected completion', async () => {
        vi.stubEnv('OPENAI_API_KEY', '')

        const result = await rewriteDemoSkillQuery({
            latestUserMessage: 'evet göster',
            responseLanguage: 'tr',
            recentMessages: [],
        })

        expect(result).toBeNull()
        vi.unstubAllEnvs()
    })
})
