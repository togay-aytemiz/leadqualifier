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

    it('preserves standalone questions without requiring history use', async () => {
        const createCompletion = vi.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({
                        query: 'Tıp Fakültesi ücreti ne kadar?',
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
            recentMessages: [{ role: 'assistant', content: 'Kampüsleri de sorabilirsin.' }],
            createCompletion,
        })

        expect(result).toMatchObject({
            query: 'Tıp Fakültesi ücreti ne kadar?',
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
