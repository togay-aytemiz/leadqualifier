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

    it('fetches message templates for a business account', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                data: [
                    {
                        id: 'tpl-1',
                        name: 'hello_world',
                        status: 'APPROVED',
                        language: 'en_US',
                        category: 'UTILITY'
                    }
                ]
            })
        })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new WhatsAppClient('token-1')
        const result = await client.getMessageTemplates('waba-1')

        expect(result.data[0]?.name).toBe('hello_world')
        expect(fetchMock).toHaveBeenCalledWith(
            'https://graph.facebook.com/v21.0/waba-1/message_templates?fields=id,name,status,language,category&limit=100',
            expect.objectContaining({
                method: 'GET'
            })
        )
    })

    it('sends template messages with optional body parameters', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ messages: [{ id: 'wamid.template.1' }] })
        })) as unknown as typeof fetch
        vi.stubGlobal('fetch', fetchMock)

        const client = new WhatsAppClient('token-1')
        await client.sendTemplate({
            phoneNumberId: 'phone-1',
            to: '905551112233',
            templateName: 'appointment_reminder',
            languageCode: 'tr',
            bodyParameters: ['Togay', 'yarın 16:00']
        })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [, callInit] = fetchMock.mock.calls[0] ?? []
        const body = JSON.parse(String((callInit as RequestInit)?.body))

        expect(body).toEqual({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: '905551112233',
            type: 'template',
            template: {
                name: 'appointment_reminder',
                language: { code: 'tr' },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: 'Togay' },
                            { type: 'text', text: 'yarın 16:00' }
                        ]
                    }
                ]
            }
        })
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
