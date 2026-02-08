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

    async getPhoneNumber(phoneNumberId: string): Promise<WhatsAppPhoneNumberDetails> {
        return this.request<WhatsAppPhoneNumberDetails>(`${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`, {
            method: 'GET'
        })
    }
}
