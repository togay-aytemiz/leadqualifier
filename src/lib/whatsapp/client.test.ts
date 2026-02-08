import { afterEach, describe, expect, it, vi } from 'vitest'

import { WhatsAppClient } from '@/lib/whatsapp/client'

describe('WhatsAppClient', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('sends text messages with graph api payload', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ messages: [{ id: 'wamid.1' }] })
        })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new WhatsAppClient('token-1')
        await client.sendText({
            phoneNumberId: 'phone-1',
            to: '905551112233',
            text: 'Merhaba'
        })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(
            'https://graph.facebook.com/v21.0/phone-1/messages',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer token-1',
                    'Content-Type': 'application/json'
                })
            })
        )
    })

    it('fetches phone number details for health checks', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ id: 'phone-1', display_phone_number: '+90 555 111 22 33' })
        })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new WhatsAppClient('token-1')
        const result = await client.getPhoneNumber('phone-1')

        expect(result.id).toBe('phone-1')
        expect(fetchMock).toHaveBeenCalledWith(
            'https://graph.facebook.com/v21.0/phone-1?fields=id,display_phone_number,verified_name,quality_rating',
            expect.objectContaining({
                method: 'GET'
            })
        )
    })

    it('throws a normalized error when graph api returns non-ok response', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: false,
            json: async () => ({
                error: {
                    message: 'Invalid OAuth access token.'
                }
            })
        })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new WhatsAppClient('bad-token')

        await expect(client.getPhoneNumber('phone-1')).rejects.toThrow('Invalid OAuth access token.')
    })
})
