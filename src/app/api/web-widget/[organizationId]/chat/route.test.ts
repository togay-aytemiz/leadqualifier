import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const { simulateChatMock } = vi.hoisted(() => ({
    simulateChatMock: vi.fn(),
}))

vi.mock('@/lib/chat/actions', () => ({
    simulateChat: simulateChatMock,
}))

function createRequest(body: unknown) {
    return new Request('http://localhost/api/web-widget/org-1/chat', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    })
}

describe('web widget chat API route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        simulateChatMock.mockResolvedValue({
            response: 'Simülatör cevabı',
            skillImage: {
                imageUrl: 'https://cdn.example.com/skill.webp',
                mimeType: 'image/webp',
                fileName: 'skill.webp',
            },
        })
    })

    it('calls simulateChat with organization id, message, threshold, and recent history', async () => {
        const response = await POST(createRequest({
            message: 'Fiyat nedir?',
            threshold: 0.7,
            conversationHistory: [
                { role: 'user', content: 'Merhaba' },
                { role: 'assistant', content: 'Merhaba, nasıl yardımcı olayım?' },
            ],
        }), {
            params: Promise.resolve({ organizationId: 'org-1' }),
        })

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
            response: 'Simülatör cevabı',
            skillImage: {
                imageUrl: 'https://cdn.example.com/skill.webp',
                mimeType: 'image/webp',
                fileName: 'skill.webp',
            },
        })
        expect(simulateChatMock).toHaveBeenCalledWith('Fiyat nedir?', 'org-1', 0.7, [
            expect.objectContaining({ role: 'user', content: 'Merhaba' }),
            expect.objectContaining({ role: 'assistant', content: 'Merhaba, nasıl yardımcı olayım?' }),
        ])
    })

    it('rejects empty messages before simulator work starts', async () => {
        const response = await POST(createRequest({ message: '   ' }), {
            params: Promise.resolve({ organizationId: 'org-1' }),
        })

        expect(response.status).toBe(400)
        expect(simulateChatMock).not.toHaveBeenCalled()
    })
})
