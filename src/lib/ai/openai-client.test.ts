import { describe, expect, it, vi } from 'vitest'
import { createOpenAiFetch } from './openai-client'

describe('createOpenAiFetch', () => {
    it('omits ambient request cookies while preserving OpenAI request headers', async () => {
        const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
        const openAiFetch = createOpenAiFetch(fetchMock)

        await openAiFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                authorization: 'Bearer sk-test',
                'content-type': 'application/json',
                cookie: 'large=browser-cookie',
                forwarded: 'for=127.0.0.1',
                'x-forwarded-for': '127.0.0.1'
            },
            body: '{}'
        })

        expect(fetchMock).toHaveBeenCalledOnce()
        const [, init] = fetchMock.mock.calls[0] ?? []
        const headers = new Headers(init?.headers)
        expect(init?.credentials).toBe('omit')
        expect(headers.get('authorization')).toBe('Bearer sk-test')
        expect(headers.get('content-type')).toBe('application/json')
        expect(headers.has('cookie')).toBe(false)
        expect(headers.has('forwarded')).toBe(false)
        expect(headers.has('x-forwarded-for')).toBe(false)
    })

    it('sanitizes Request input headers without dropping OpenAI headers', async () => {
        const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
        const openAiFetch = createOpenAiFetch(fetchMock)
        const request = new Request('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                authorization: 'Bearer sk-test',
                'content-type': 'application/json',
                cookie: 'large=browser-cookie',
                'x-forwarded-host': 'app.askqualy.com'
            },
            body: '{}'
        })

        await openAiFetch(request)

        expect(fetchMock).toHaveBeenCalledOnce()
        const [, init] = fetchMock.mock.calls[0] ?? []
        const headers = new Headers(init?.headers)
        expect(init?.credentials).toBe('omit')
        expect(headers.get('authorization')).toBe('Bearer sk-test')
        expect(headers.get('content-type')).toBe('application/json')
        expect(headers.has('cookie')).toBe(false)
        expect(headers.has('x-forwarded-host')).toBe(false)
    })
})
