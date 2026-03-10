const INSTAGRAM_MESSAGING_GRAPH_API_BASE = 'https://graph.facebook.com'
const INSTAGRAM_LOGIN_GRAPH_API_BASE = 'https://graph.instagram.com'
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

export interface InstagramUserProfile {
    id: string
    username?: string
    name?: string
    profile_picture_url?: string
}

export class InstagramClient {
    private accessToken: string
    private graphVersion: string

    constructor(
        accessToken: string,
        graphVersion: string = process.env.INSTAGRAM_GRAPH_API_VERSION
            || process.env.WHATSAPP_GRAPH_API_VERSION
            || DEFAULT_GRAPH_API_VERSION
    ) {
        this.accessToken = accessToken
        this.graphVersion = graphVersion || DEFAULT_GRAPH_API_VERSION
    }

    private async requestToBase<T>(baseUrl: string, path: string, init: RequestInit): Promise<T> {
        const response = await fetch(`${baseUrl}/${this.graphVersion}/${path}`, {
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

    private async request<T>(path: string, init: RequestInit): Promise<T> {
        return this.requestToBase<T>(INSTAGRAM_MESSAGING_GRAPH_API_BASE, path, init)
    }

    private async requestInstagramLogin<T>(path: string, init: RequestInit): Promise<T> {
        return this.requestToBase<T>(INSTAGRAM_LOGIN_GRAPH_API_BASE, path, init)
    }

    async sendText(params: {
        instagramBusinessAccountId: string
        to: string
        text: string
    }) {
        const path = `${params.instagramBusinessAccountId}/messages`
        const payload = {
            messaging_product: 'instagram',
            recipient: {
                id: params.to
            },
            message: {
                text: params.text
            }
        }

        try {
            return await this.requestInstagramLogin<{ message_id?: string }>(path, {
                method: 'POST',
                body: JSON.stringify(payload)
            })
        } catch (instagramLoginError) {
            try {
                return await this.request<{ message_id?: string }>(path, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                })
            } catch {
                throw instagramLoginError
            }
        }
    }

    async getBusinessAccount(instagramBusinessAccountId: string): Promise<InstagramBusinessAccountDetails> {
        return this.request<InstagramBusinessAccountDetails>(
            `${instagramBusinessAccountId}?fields=id,username,name,profile_picture_url`,
            {
                method: 'GET'
            }
        )
    }

    async getUserProfile(instagramUserId: string): Promise<InstagramUserProfile> {
        try {
            return await this.requestInstagramLogin<InstagramUserProfile>(
                `${instagramUserId}?fields=id,username,name`,
                {
                    method: 'GET'
                }
            )
        } catch (instagramLoginError) {
            try {
                return await this.request<InstagramUserProfile>(
                    `${instagramUserId}?fields=id,username,name`,
                    {
                        method: 'GET'
                    }
                )
            } catch {
                throw instagramLoginError
            }
        }
    }
}
