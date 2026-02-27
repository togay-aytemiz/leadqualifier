const WHATSAPP_GRAPH_API_BASE = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v21.0'

type GraphApiErrorResponse = {
    error?: {
        message?: string
    }
}

export interface WhatsAppPhoneNumberDetails {
    id: string
    display_phone_number?: string
    verified_name?: string
    quality_rating?: string
}

export interface WhatsAppMessageTemplate {
    id?: string
    name?: string
    status?: string
    language?: string
    category?: string
}

export interface WhatsAppMessageTemplatesResponse {
    data: WhatsAppMessageTemplate[]
}

export interface WhatsAppMediaMetadata {
    id: string
    url: string
    mime_type?: string
    sha256?: string
    file_size?: number
}

export class WhatsAppClient {
    private accessToken: string
    private graphVersion: string

    constructor(accessToken: string, graphVersion: string = process.env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION) {
        this.accessToken = accessToken
        this.graphVersion = graphVersion || DEFAULT_GRAPH_API_VERSION
    }

    private async request<T>(path: string, init: RequestInit): Promise<T> {
        const response = await fetch(`${WHATSAPP_GRAPH_API_BASE}/${this.graphVersion}/${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                ...(init.headers ?? {})
            }
        })

        const payload = await response.json() as T & GraphApiErrorResponse
        if (!response.ok) {
            throw new Error(payload?.error?.message || `WhatsApp Graph API request failed with status ${response.status}`)
        }

        return payload
    }

    async sendText(params: {
        phoneNumberId: string
        to: string
        text: string
    }) {
        return this.request<{ messages?: Array<{ id?: string }> }>(`${params.phoneNumberId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: params.to,
                type: 'text',
                text: {
                    body: params.text
                }
            })
        })
    }

    async sendTemplate(params: {
        phoneNumberId: string
        to: string
        templateName: string
        languageCode: string
        bodyParameters?: string[]
    }) {
        const parameters = (params.bodyParameters ?? [])
            .map(value => value.trim())
            .filter(Boolean)
            .map(text => ({
                type: 'text' as const,
                text
            }))

        const templatePayload: {
            name: string
            language: { code: string }
            components?: Array<{
                type: 'body'
                parameters: Array<{ type: 'text'; text: string }>
            }>
        } = {
            name: params.templateName,
            language: {
                code: params.languageCode
            }
        }

        if (parameters.length > 0) {
            templatePayload.components = [
                {
                    type: 'body',
                    parameters
                }
            ]
        }

        return this.request<{ messages?: Array<{ id?: string }> }>(`${params.phoneNumberId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: params.to,
                type: 'template',
                template: templatePayload
            })
        })
    }

    async getMessageTemplates(businessAccountId: string, limit = 100): Promise<WhatsAppMessageTemplatesResponse> {
        return this.request<WhatsAppMessageTemplatesResponse>(`${businessAccountId}/message_templates?fields=id,name,status,language,category&limit=${limit}`, {
            method: 'GET'
        })
    }

    async getPhoneNumber(phoneNumberId: string): Promise<WhatsAppPhoneNumberDetails> {
        return this.request<WhatsAppPhoneNumberDetails>(`${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`, {
            method: 'GET'
        })
    }

    async getMediaMetadata(mediaId: string): Promise<WhatsAppMediaMetadata> {
        return this.request<WhatsAppMediaMetadata>(`${mediaId}`, {
            method: 'GET'
        })
    }

    async downloadMedia(mediaUrl: string): Promise<{ data: ArrayBuffer; contentType: string | null }> {
        const response = await fetch(mediaUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.accessToken}`
            }
        })

        if (!response.ok) {
            let errorMessage = `WhatsApp media download failed with status ${response.status}`
            try {
                const payload = await response.json() as GraphApiErrorResponse
                errorMessage = payload?.error?.message || errorMessage
            } catch {
                // Keep fallback error message when non-JSON body is returned.
            }
            throw new Error(errorMessage)
        }

        return {
            data: await response.arrayBuffer(),
            contentType: response.headers.get('content-type')
        }
    }
}
