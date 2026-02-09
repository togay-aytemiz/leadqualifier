const INSTAGRAM_GRAPH_API_BASE = 'https://graph.facebook.com'
const DEFAULT_GRAPH_API_VERSION = 'v21.0'

type GraphApiErrorResponse = {
    error?: {
        message?: string
    }
}

export interface InstagramBusinessAccountDetails {
    id: string
    username?: string
    name?: string
    profile_picture_url?: string
}

export class InstagramClient {
    private accessToken: string
    private graphVersion: string

    constructor(accessToken: string, graphVersion: string = process.env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION) {
        this.accessToken = accessToken
        this.graphVersion = graphVersion || DEFAULT_GRAPH_API_VERSION
    }

    private async request<T>(path: string, init: RequestInit): Promise<T> {
        const response = await fetch(`${INSTAGRAM_GRAPH_API_BASE}/${this.graphVersion}/${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                ...(init.headers ?? {})
            }
        })

        const payload = await response.json() as T & GraphApiErrorResponse
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Instagram Graph API request failed with status ${response.status}`)
        }

        return payload
    }

    async sendText(params: {
        instagramBusinessAccountId: string
        to: string
        text: string
    }) {
        return this.request<{ message_id?: string }>(`${params.instagramBusinessAccountId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                messaging_product: 'instagram',
                recipient: {
                    id: params.to
                },
                message: {
                    text: params.text
                }
            })
        })
    }

    async getBusinessAccount(instagramBusinessAccountId: string): Promise<InstagramBusinessAccountDetails> {
        return this.request<InstagramBusinessAccountDetails>(
            `${instagramBusinessAccountId}?fields=id,username,name,profile_picture_url`,
            {
                method: 'GET'
            }
        )
    }
}
