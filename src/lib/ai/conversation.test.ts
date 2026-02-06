import { describe, expect, it } from 'vitest'
import {
    buildConversationContinuityGuidance,
    normalizeConversationHistory,
    stripRepeatedGreeting,
    toOpenAiConversationMessages
} from '@/lib/ai/conversation'

describe('normalizeConversationHistory', () => {
    it('removes latest user turn when it matches current user message', () => {
        const history = normalizeConversationHistory(
            [
                { role: 'user', content: 'Merhaba' },
                { role: 'assistant', content: 'Merhaba! Nasılsınız?' },
                { role: 'user', content: 'yarin olur mu' }
            ],
            'yarin olur mu'
        )

        expect(history).toEqual([
            { role: 'user', content: 'Merhaba' },
            { role: 'assistant', content: 'Merhaba! Nasılsınız?' }
        ])
    })

    it('keeps only the most recent maxTurns turns', () => {
        const turns = Array.from({ length: 14 }).map((_, index) => ({
            role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
            content: `turn-${index + 1}`
        }))

        const history = normalizeConversationHistory(turns, undefined, 10)
        expect(history).toHaveLength(10)
        expect(history[0]?.content).toBe('turn-5')
        expect(history[9]?.content).toBe('turn-14')
    })
})

describe('toOpenAiConversationMessages', () => {
    it('maps normalized history into openai-compatible role messages', () => {
        const messages = toOpenAiConversationMessages(
            [
                { role: 'assistant', content: 'Merhaba' },
                { role: 'user', content: 'Fiyat nedir?' },
                { role: 'user', content: 'Fiyat nedir?' }
            ],
            'Fiyat nedir?'
        )

        expect(messages).toEqual([
            { role: 'assistant', content: 'Merhaba' },
            { role: 'user', content: 'Fiyat nedir?' }
        ])
    })
})

describe('buildConversationContinuityGuidance', () => {
    it('includes continuity rules and known lead snapshot fields', () => {
        const guidance = buildConversationContinuityGuidance({
            recentAssistantMessages: ['Merhaba! Size nasıl yardımcı olabilirim?'],
            leadSnapshot: {
                service_type: 'Yenidoğan çekimi',
                extracted_fields: {
                    desired_date: 'yarın',
                    location: 'Kadıköy'
                }
            }
        })

        expect(guidance).toContain('Continue the current conversation naturally')
        expect(guidance).toContain('Do not repeat greeting/opening phrases')
        expect(guidance).toContain('Known lead facts')
        expect(guidance).toContain('Yenidoğan çekimi')
        expect(guidance).toContain('yarın')
        expect(guidance).toContain('Kadıköy')
    })
})

describe('stripRepeatedGreeting', () => {
    it('removes repeated greeting if recent assistant message already greeted', () => {
        const reply = stripRepeatedGreeting(
            'Merhaba! Elbette yardımcı olayım.',
            ['Merhaba, size nasıl yardımcı olabilirim?']
        )

        expect(reply).toBe('Elbette yardımcı olayım.')
    })

    it('keeps response unchanged when no repeated greeting exists', () => {
        const reply = stripRepeatedGreeting('Randevu için yarın uygun.', ['Fiyat bilgisi paylaşayım.'])
        expect(reply).toBe('Randevu için yarın uygun.')
    })
})
