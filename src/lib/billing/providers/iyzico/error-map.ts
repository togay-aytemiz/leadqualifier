import { IyzicoClientError } from '@/lib/billing/providers/iyzico/client'

export type IyzicoCheckoutFailureReason =
    | 'insufficient_funds'
    | 'payment_not_approved'
    | 'security_check_failed'
    | 'expired_card'
    | 'invalid_cvc'
    | 'internet_shopping_disabled'
    | 'card_not_supported'
    | 'payment_processing_error'

function normalizeErrorCode(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function normalizeErrorMessage(value: unknown) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim().toLocaleLowerCase('tr-TR')
    return trimmed.length > 0 ? trimmed : null
}

function readProviderErrorCode(value: unknown) {
    if (value instanceof IyzicoClientError) {
        return normalizeErrorCode(value.providerErrorCode)
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return normalizeErrorCode((value as Record<string, unknown>).errorCode)
}

function readProviderErrorMessage(value: unknown) {
    if (value instanceof IyzicoClientError) {
        return normalizeErrorMessage(value.providerErrorMessage ?? value.message)
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    return normalizeErrorMessage(record.errorMessage)
}

export function mapIyzicoProviderFailureToCheckoutError(value: unknown): IyzicoCheckoutFailureReason | null {
    const errorCode = readProviderErrorCode(value)
    const errorMessage = readProviderErrorMessage(value)

    switch (errorCode) {
    case '10051':
        return 'insufficient_funds'
    case '10054':
        return 'expired_card'
    case '10084':
        return 'invalid_cvc'
    case '10093':
        return 'internet_shopping_disabled'
    case '201552':
        return 'card_not_supported'
    case '6001':
    case '10034':
        return 'security_check_failed'
    case '10005':
    case '10012':
    case '10057':
    case '10058':
        return 'payment_not_approved'
    case '10202':
        return 'payment_processing_error'
    default:
        break
    }

    if (!errorMessage) return null

    if (errorMessage.includes('yetersiz bakiye') || errorMessage.includes('limiti yetersiz')) {
        return 'insufficient_funds'
    }
    if (errorMessage.includes('son kullanma tarihi')) {
        return 'expired_card'
    }
    if (errorMessage.includes('cvc')) {
        return 'invalid_cvc'
    }
    if (errorMessage.includes('internetten alışverişe kapalı')) {
        return 'internet_shopping_disabled'
    }
    if (errorMessage.includes('uygun değil')) {
        return 'card_not_supported'
    }
    if (errorMessage.includes('güvenlik denetimini geçemedi')) {
        return 'security_check_failed'
    }
    if (
        errorMessage.includes('işlem onaylanmadı')
        || errorMessage.includes('kart sahibi bu işlemi yapamaz')
        || errorMessage.includes('terminalin bu işlemi yapmaya yetkisi yok')
        || errorMessage.includes('geçersiz işlem')
    ) {
        return 'payment_not_approved'
    }
    if (errorMessage.includes('genel bir hata')) {
        return 'payment_processing_error'
    }

    return null
}
