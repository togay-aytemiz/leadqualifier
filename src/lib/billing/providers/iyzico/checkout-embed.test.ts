import { describe, expect, it, vi } from 'vitest'
import {
    IYZICO_BUNDLE_SCRIPT_SELECTOR,
    resetIyzicoCheckoutRuntime
} from './checkout-embed'

describe('iyzico checkout embed runtime reset', () => {
    it('clears cached iyzico globals and removes injected checkout bundle scripts', () => {
        const removeFirst = vi.fn()
        const removeSecond = vi.fn()
        const querySelectorAll = vi.fn(() => [
            { remove: removeFirst },
            { remove: removeSecond }
        ])
        const runtimeWindow: Record<string, unknown> = {
            iyziInit: { token: 'old-token' },
            iyziUcsInit: { token: 'old-ucs-token' },
            iyziSubscriptionInit: { price: '349.00' },
            keepMe: true
        }

        resetIyzicoCheckoutRuntime({ querySelectorAll }, runtimeWindow)

        expect(querySelectorAll).toHaveBeenCalledWith(IYZICO_BUNDLE_SCRIPT_SELECTOR)
        expect(runtimeWindow.iyziInit).toBeUndefined()
        expect(runtimeWindow.iyziUcsInit).toBeUndefined()
        expect(runtimeWindow.iyziSubscriptionInit).toBeUndefined()
        expect(runtimeWindow.keepMe).toBe(true)
        expect(removeFirst).toHaveBeenCalledTimes(1)
        expect(removeSecond).toHaveBeenCalledTimes(1)
    })

    it('does not throw when iyzico globals are non-configurable window properties', () => {
        const querySelectorAll = vi.fn(() => [])
        const runtimeWindow: Record<string, unknown> = {}

        Object.defineProperty(runtimeWindow, 'iyziInit', {
            value: { token: 'old-token' },
            writable: true,
            configurable: false,
            enumerable: true
        })
        Object.defineProperty(runtimeWindow, 'iyziUcsInit', {
            value: { token: 'old-ucs-token' },
            writable: true,
            configurable: false,
            enumerable: true
        })
        Object.defineProperty(runtimeWindow, 'iyziSubscriptionInit', {
            value: { price: '349.00' },
            writable: true,
            configurable: false,
            enumerable: true
        })

        expect(() => resetIyzicoCheckoutRuntime({ querySelectorAll }, runtimeWindow)).not.toThrow()
        expect(runtimeWindow.iyziInit).toBeUndefined()
        expect(runtimeWindow.iyziUcsInit).toBeUndefined()
        expect(runtimeWindow.iyziSubscriptionInit).toBeUndefined()
    })
})
