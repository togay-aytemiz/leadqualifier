
const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

export class TelegramClient {
    private token: string

    constructor(token: string) {
        this.token = token
    }

    private async request(method: string, body?: any) {
        const response = await fetch(`${TELEGRAM_API_BASE}${this.token}/${method}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        })

        const data = await response.json()
        if (!data.ok) {
            throw new Error(data.description || 'Telegram API error')
        }
        return data.result
    }

    async getMe() {
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
}
