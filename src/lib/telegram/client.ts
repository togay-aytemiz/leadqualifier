
const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

export interface TelegramBotInfo {
    id: number
    is_bot: boolean
    first_name: string
    username?: string
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
