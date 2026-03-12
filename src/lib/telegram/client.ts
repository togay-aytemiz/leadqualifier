
const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

export interface TelegramBotInfo {
    id: number
    is_bot: boolean
    first_name: string
    username?: string
}

interface TelegramPhotoSize {
    file_id: string
}

interface TelegramUserProfilePhotos {
    total_count: number
    photos: TelegramPhotoSize[][]
}

interface TelegramFile {
    file_id: string
    file_path?: string
}

export class TelegramClient {
    private token: string

    constructor(token: string) {
        this.token = token
    }

    private async request<T>(method: string, body?: Record<string, unknown>): Promise<T> {
        const response = await fetch(`${TELEGRAM_API_BASE}${this.token}/${method}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        })

        const data = await response.json() as { ok?: boolean; description?: string; result?: unknown }
        if (!data.ok) {
            throw new Error(data.description || 'Telegram API error')
        }
        return data.result as T
    }

    async getMe(): Promise<TelegramBotInfo> {
        return this.request('getMe')
    }

    async getUserProfilePhotos(
        userId: number | string,
        options?: {
            offset?: number
            limit?: number
        }
    ): Promise<TelegramUserProfilePhotos> {
        return this.request('getUserProfilePhotos', {
            user_id: userId,
            ...(typeof options?.offset === 'number' ? { offset: options.offset } : {}),
            ...(typeof options?.limit === 'number' ? { limit: options.limit } : {})
        })
    }

    async getFile(fileId: string): Promise<TelegramFile> {
        return this.request('getFile', {
            file_id: fileId
        })
    }

    buildFileUrl(filePath: string) {
        return `https://api.telegram.org/file/bot${this.token}/${filePath}`
    }

    async getUserProfilePhotoUrl(userId: number | string): Promise<string | null> {
        const profilePhotos = await this.getUserProfilePhotos(userId, { limit: 1 })
        const firstPhoto = Array.isArray(profilePhotos.photos) ? profilePhotos.photos[0] : null
        const largestPhoto = Array.isArray(firstPhoto) ? firstPhoto[firstPhoto.length - 1] : null
        const fileId = largestPhoto?.file_id?.trim()
        if (!fileId) return null

        const file = await this.getFile(fileId)
        const filePath = file.file_path?.trim()
        if (!filePath) return null

        return this.buildFileUrl(filePath)
    }

    async setWebhook(url: string, secretToken?: string) {
        return this.request('setWebhook', {
            url,
            secret_token: secretToken
        })
    }

    async deleteWebhook() {
        return this.request('deleteWebhook')
    }

    async sendMessage(chatId: number | string, text: string) {
        return this.request('sendMessage', {
            chat_id: chatId,
            text,
        })
    }
    async getWebhookInfo(): Promise<Record<string, unknown>> {
        return this.request('getWebhookInfo')
    }
}
