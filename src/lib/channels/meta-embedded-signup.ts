export interface MetaEmbeddedSignupConfig {
    appId: string
    configId: string
}

export type MetaEmbeddedSignupMode = 'new' | 'existing'

export type MetaEmbeddedSignupEvent =
    | {
        type: 'finish'
        businessAccountId: string
        phoneNumberId: string
    }
    | {
        type: 'cancel'
        currentStep: string | null
    }
    | {
        type: 'error'
        message: string | null
    }

function asString(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePayload(data: unknown) {
    if (typeof data === 'string') {
        try {
            return JSON.parse(data) as unknown
        } catch {
            return null
        }
    }

    return data
}

function isTrustedMetaOrigin(origin: string) {
    return origin === 'https://www.facebook.com' || origin === 'https://web.facebook.com'
}

export function getMetaEmbeddedSignupConfig(mode: MetaEmbeddedSignupMode = 'new'): MetaEmbeddedSignupConfig | null {
    const appId = asString(process.env.NEXT_PUBLIC_META_APP_ID)
    const configId = mode === 'existing'
        ? asString(process.env.NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_EXISTING_NUMBER_CONFIG_ID)
        : asString(process.env.NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID)

    if (!appId || !configId) return null

    return {
        appId,
        configId
    }
}

export function parseMetaEmbeddedSignupMessage(origin: string, data: unknown): MetaEmbeddedSignupEvent | null {
    if (!isTrustedMetaOrigin(origin)) return null

    const payload = parsePayload(data)
    if (!isRecord(payload)) return null
    if (asString(payload.type) !== 'WA_EMBEDDED_SIGNUP') return null

    const eventType = asString(payload.event)
    const eventData = isRecord(payload.data) ? payload.data : null

    if (eventType === 'FINISH' && eventData) {
        const phoneNumberId = asString(eventData.phone_number_id)
        const businessAccountId = asString(eventData.waba_id)
        if (!phoneNumberId || !businessAccountId) return null

        return {
            type: 'finish',
            phoneNumberId,
            businessAccountId
        }
    }

    if (eventType === 'CANCEL') {
        return {
            type: 'cancel',
            currentStep: eventData ? asString(eventData.current_step) : null
        }
    }

    if (eventType === 'ERROR') {
        return {
            type: 'error',
            message: eventData
                ? (asString(eventData.error_message) || asString(eventData.error))
                : null
        }
    }

    return null
}
