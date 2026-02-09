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
            'https://graph.facebook.com/v21.0/ig-business-1/messages',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer token-1',
                    'Content-Type': 'application/json'
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
