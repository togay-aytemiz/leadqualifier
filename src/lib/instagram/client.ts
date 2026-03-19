const INSTAGRAM_MESSAGING_GRAPH_API_BASE = 'https://graph.facebook.com'
const INSTAGRAM_LOGIN_GRAPH_API_BASE = 'https://graph.instagram.com'
const DEFAULT_GRAPH_API_VERSION = 'v21.0'
const INSTAGRAM_USER_PROFILE_FIELDS_WITH_AVATAR = 'id,username,name,profile_pic'
const INSTAGRAM_USER_PROFILE_FIELDS_BASIC = 'id,username,name'

export const INSTAGRAM_WEBHOOK_SUBSCRIBED_FIELDS = [
    'messages',
    'messaging_optins',
    'messaging_postbacks',
    'messaging_referral',
    'messaging_seen',
    'message_reactions',
    'messaging_handover',
    'standby'
] as const

type GraphApiErrorResponse = {
    error?: {
        message?: string
    }
}

type InstagramUserProfileResponse = {
    id: string
    username?: string
    name?: string
    profile_pic?: string
    profile_picture_url?: string
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

export interface InstagramWebhookSubscriptionResponse {
    success: boolean
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

    private normalizeUserProfile(payload: InstagramUserProfileResponse): InstagramUserProfile {
        return {
            id: payload.id,
            username: payload.username,
            name: payload.name,
            profile_picture_url: payload.profile_picture_url || payload.profile_pic
        }
    }

    private async requestUserProfileWithFields(
        instagramUserId: string,
        fields: string
    ): Promise<InstagramUserProfile> {
        try {
            const payload = await this.requestInstagramLogin<InstagramUserProfileResponse>(
                `${instagramUserId}?fields=${fields}`,
                {
                    method: 'GET'
                }
            )
            return this.normalizeUserProfile(payload)
        } catch (instagramLoginError) {
            try {
                const payload = await this.request<InstagramUserProfileResponse>(
                    `${instagramUserId}?fields=${fields}`,
                    {
                        method: 'GET'
                    }
                )
                return this.normalizeUserProfile(payload)
            } catch {
                throw instagramLoginError
            }
        }
    }

    private shouldRetryUserProfileWithoutAvatarField(error: unknown) {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
        return message.includes('profile_picture_url')
            || message.includes('profile_pic')
            || message.includes('unsupported')
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
            try {
                return await this.requestInstagramLogin<{ message_id?: string }>(path, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                })
            } catch {
                return await this.request<{ message_id?: string }>(path, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                })
            }
        } catch (instagramLoginError) {
            throw instagramLoginError
        }
    }

    async sendImage(params: {
        instagramBusinessAccountId: string
        to: string
        imageUrl: string
    }) {
        const path = `${params.instagramBusinessAccountId}/messages`
        const payload = {
            messaging_product: 'instagram',
            recipient: {
                id: params.to
            },
            message: {
                attachment: {
                    type: 'image',
                    payload: {
                        url: params.imageUrl
                    }
                }
            }
        }

        try {
            try {
                return await this.requestInstagramLogin<{ message_id?: string }>(path, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                })
            } catch {
                return await this.request<{ message_id?: string }>(path, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                })
            }
        } catch (instagramLoginError) {
            throw instagramLoginError
        }
    }

    async subscribeAppToAccount(params: {
        instagramAccountId: string
        subscribedFields: readonly string[]
    }): Promise<InstagramWebhookSubscriptionResponse> {
        const searchParams = new URLSearchParams({
            subscribed_fields: params.subscribedFields.join(',')
        })

        return this.requestInstagramLogin<InstagramWebhookSubscriptionResponse>(
            `${params.instagramAccountId}/subscribed_apps?${searchParams.toString()}`,
            {
                method: 'POST'
            }
        )
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
            return await this.requestUserProfileWithFields(
                instagramUserId,
                INSTAGRAM_USER_PROFILE_FIELDS_WITH_AVATAR
            )
        } catch (error) {
            if (!this.shouldRetryUserProfileWithoutAvatarField(error)) {
                throw error
            }

            return this.requestUserProfileWithFields(
                instagramUserId,
                INSTAGRAM_USER_PROFILE_FIELDS_BASIC
            )
        }
    }
}
