export const IYZICO_RUNTIME_GLOBAL_KEYS = ['iyziInit', 'iyziUcsInit', 'iyziSubscriptionInit'] as const
export const IYZICO_BUNDLE_SCRIPT_SELECTOR = 'script[src*="iyzipay.com/checkoutform/v2/bundle.js"]'

interface RemovableNode {
    remove: () => void
}

interface RuntimeDocument {
    querySelectorAll: (selector: string) => ArrayLike<RemovableNode> | Iterable<RemovableNode>
}

interface RuntimeWindow {
    iyziInit?: unknown
    iyziUcsInit?: unknown
    iyziSubscriptionInit?: unknown
}

export function resetIyzicoCheckoutRuntime<T extends object>(
    runtimeDocument: RuntimeDocument,
    runtimeWindow: T & RuntimeWindow
) {
    const runtimeRecord = runtimeWindow as Record<string, unknown>

    for (const key of IYZICO_RUNTIME_GLOBAL_KEYS) {
        const descriptor = Object.getOwnPropertyDescriptor(runtimeWindow, key)

        if (!descriptor || descriptor.configurable) {
            Reflect.deleteProperty(runtimeRecord, key)
            continue
        }

        if (descriptor.writable || typeof descriptor.set === 'function') {
            try {
                runtimeRecord[key] = undefined
            } catch {
                // Ignore non-resettable runtime globals; removing bundle scripts is still the main reset path.
            }
        }
    }

    for (const script of Array.from(runtimeDocument.querySelectorAll(IYZICO_BUNDLE_SCRIPT_SELECTOR))) {
        script.remove()
    }
}
