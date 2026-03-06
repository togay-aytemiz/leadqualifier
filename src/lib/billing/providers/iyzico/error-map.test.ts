import { describe, expect, it } from 'vitest'
import { IyzicoClientError } from '@/lib/billing/providers/iyzico/client'
import { mapIyzicoProviderFailureToCheckoutError } from '@/lib/billing/providers/iyzico/error-map'

describe('mapIyzicoProviderFailureToCheckoutError', () => {
    it('maps insufficient funds failures', () => {
        const error = new IyzicoClientError('request_failed', 'Kart limiti yetersiz, yetersiz bakiye', {
            providerErrorCode: '10051',
            providerErrorMessage: 'Kart limiti yetersiz, yetersiz bakiye'
        })

        expect(mapIyzicoProviderFailureToCheckoutError(error)).toBe('insufficient_funds')
    })

    it('maps invalid cvc failures', () => {
        const error = new IyzicoClientError('request_failed', 'Cvc2 bilgisi hatalı', {
            providerErrorCode: '10084',
            providerErrorMessage: 'Cvc2 bilgisi hatalı'
        })

        expect(mapIyzicoProviderFailureToCheckoutError(error)).toBe('invalid_cvc')
    })

    it('maps unsupported cards for checkout copy', () => {
        const error = new IyzicoClientError('request_failed', 'Kart işlem için uygun değil.', {
            providerErrorCode: '201552',
            providerErrorMessage: 'Kart işlem için uygun değil.'
        })

        expect(mapIyzicoProviderFailureToCheckoutError(error)).toBe('card_not_supported')
    })

    it('returns null for unknown failures', () => {
        const error = new IyzicoClientError('request_failed', 'Unknown provider failure', {
            providerErrorCode: '99999',
            providerErrorMessage: 'Unknown provider failure'
        })

        expect(mapIyzicoProviderFailureToCheckoutError(error)).toBeNull()
    })
})
