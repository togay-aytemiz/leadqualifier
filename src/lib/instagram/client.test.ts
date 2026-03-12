import { afterEach, describe, expect, it, vi } from 'vitest'

import { InstagramClient } from '@/lib/instagram/client'

describe('InstagramClient', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('sends text messages with graph api payload', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ message_id: 'igmid.1' })
        })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new InstagramClient('token-1')
        await client.sendText({
            instagramBusinessAccountId: 'ig-business-1',
            to: 'ig-user-1',
            text: 'Merhaba'
        })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(
            'https://graph.instagram.com/v21.0/ig-business-1/messages',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer token-1',
                    'Content-Type': 'application/json'
                })
            })
        )
    })

    it('falls back to graph.facebook send endpoint when instagram graph send fails', async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async () => ({
                ok: false,
                json: async () => ({
                    error: {
                        message: 'Temporary instagram graph send failure'
                    }
                })
            }))
            .mockImplementationOnce(async () => ({
                ok: true,
                json: async () => ({ message_id: 'igmid.fallback.1' })
            })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new InstagramClient('token-1')
        const result = await client.sendText({
            instagramBusinessAccountId: 'ig-business-1',
            to: 'ig-user-1',
            text: 'Merhaba'
        })

        expect(result.message_id).toBe('igmid.fallback.1')
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://graph.instagram.com/v21.0/ig-business-1/messages',
            expect.objectContaining({ method: 'POST' })
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://graph.facebook.com/v21.0/ig-business-1/messages',
            expect.objectContaining({ method: 'POST' })
        )
    })

    it('sends image messages with attachment payload url', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ message_id: 'igmid.image.1' })
        })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new InstagramClient('token-1')
        await client.sendImage({
            instagramBusinessAccountId: 'ig-business-1',
            to: 'ig-user-1',
            imageUrl: 'https://cdn.example.com/outbound-image.jpg'
        })

        expect(fetchMock).toHaveBeenCalledWith(
            'https://graph.instagram.com/v21.0/ig-business-1/messages',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    messaging_product: 'instagram',
                    recipient: {
                        id: 'ig-user-1'
                    },
                    message: {
                        attachment: {
                            type: 'image',
                            payload: {
                                url: 'https://cdn.example.com/outbound-image.jpg'
                            }
                        }
                    }
                })
            })
        )
    })

    it('fetches instagram business account details for health checks', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ id: 'ig-business-1', username: 'leadqualifier' })
        })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new InstagramClient('token-1')
        const result = await client.getBusinessAccount('ig-business-1')

        expect(result.id).toBe('ig-business-1')
        expect(fetchMock).toHaveBeenCalledWith(
            'https://graph.facebook.com/v21.0/ig-business-1?fields=id,username,name,profile_picture_url',
            expect.objectContaining({
                method: 'GET'
            })
        )
    })

    it('fetches instagram user profile details for sender identity resolution', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                id: 'ig-user-1',
                username: 'itsalinayalin',
                name: 'Alina Yalin',
                profile_pic: 'https://cdn.example.com/ig-user-1.jpg'
            })
        })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new InstagramClient('token-1')
        const result = await client.getUserProfile('ig-user-1')

        expect(result.id).toBe('ig-user-1')
        expect(result.username).toBe('itsalinayalin')
        expect(result.profile_picture_url).toBe('https://cdn.example.com/ig-user-1.jpg')
        expect(fetchMock).toHaveBeenCalledWith(
            'https://graph.instagram.com/v21.0/ig-user-1?fields=id,username,name,profile_pic',
            expect.objectContaining({
                method: 'GET'
            })
        )
    })

    it('falls back to graph.facebook profile endpoint when instagram graph profile request fails', async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async () => ({
                ok: false,
                json: async () => ({
                    error: {
                        message: 'Temporary instagram graph failure'
                    }
                })
            }))
            .mockImplementationOnce(async () => ({
                ok: true,
                json: async () => ({ id: 'ig-user-2', username: 'fallback-user', name: 'Fallback User' })
            })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new InstagramClient('token-1')
        const result = await client.getUserProfile('ig-user-2')

        expect(result.username).toBe('fallback-user')
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://graph.instagram.com/v21.0/ig-user-2?fields=id,username,name,profile_pic',
            expect.objectContaining({
                method: 'GET'
            })
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://graph.facebook.com/v21.0/ig-user-2?fields=id,username,name,profile_pic',
            expect.objectContaining({
                method: 'GET'
            })
        )
    })

    it('throws normalized error when graph api returns non-ok response', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: false,
            json: async () => ({
                error: {
                    message: 'Invalid OAuth access token.'
                }
            })
        })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new InstagramClient('bad-token')

        await expect(client.getBusinessAccount('ig-business-1')).rejects.toThrow('Invalid OAuth access token.')
    })
})
