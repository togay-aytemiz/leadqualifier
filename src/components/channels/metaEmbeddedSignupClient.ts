'use client'

import { parseMetaEmbeddedSignupMessage, type MetaEmbeddedSignupEvent } from '@/lib/channels/meta-embedded-signup'

const EMBEDDED_SIGNUP_STATUS_TIMEOUT_MESSAGE = 'Timed out waiting for Meta embedded signup status.'

interface MetaLoginResponse {
    authResponse?: {
        code?: string | null
    }
    status?: string
}

interface MetaSdk {
    init: (config: {
        appId: string
        autoLogAppEvents?: boolean
        xfbml?: boolean
        version: string
    }) => void
    login: (callback: (response: MetaLoginResponse) => void, options: Record<string, unknown>) => void
}

type MetaWindow = Window & typeof globalThis & {
    FB?: MetaSdk
    fbAsyncInit?: () => void
    __metaSdkAppId?: string
}

export function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

export function isEmbeddedSignupStatusTimeoutError(error: unknown) {
    return getErrorMessage(error, '') === EMBEDDED_SIGNUP_STATUS_TIMEOUT_MESSAGE
}

export function wait(ms: number) {
    return new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), ms)
    })
}

export function waitForEmbeddedSignupEventOrFallback(
    eventPromise: Promise<MetaEmbeddedSignupEvent>,
    options?: {
        graceMs?: number
        waitFn?: (ms: number) => Promise<null>
    }
) {
    const graceMs = options?.graceMs ?? 2500
    const waitFn = options?.waitFn ?? wait

    return Promise.race<MetaEmbeddedSignupEvent | null>([
        eventPromise.catch((error) => {
            if (isEmbeddedSignupStatusTimeoutError(error)) {
                return null
            }

            throw error
        }),
        waitFn(graceMs).then(() => null)
    ])
}

export async function loadMetaSdk(appId: string): Promise<MetaSdk> {
    const metaWindow = window as MetaWindow

    const initializeSdk = () => {
        if (!metaWindow.FB) {
            throw new Error('Meta SDK failed to load.')
        }

        if (metaWindow.__metaSdkAppId !== appId) {
            metaWindow.FB.init({
                appId,
                autoLogAppEvents: true,
                xfbml: false,
                version: 'v21.0'
            })
            metaWindow.__metaSdkAppId = appId
        }

        return metaWindow.FB
    }

    if (metaWindow.FB) {
        return initializeSdk()
    }

    return new Promise<MetaSdk>((resolve, reject) => {
        const onReady = () => {
            try {
                resolve(initializeSdk())
            } catch (error) {
                reject(error)
            }
        }

        const existingScript = document.getElementById('facebook-jssdk') as HTMLScriptElement | null
        metaWindow.fbAsyncInit = onReady

        if (existingScript) {
            existingScript.addEventListener('load', onReady, { once: true })
            existingScript.addEventListener('error', () => reject(new Error('Meta SDK failed to load.')), { once: true })
            return
        }

        const script = document.createElement('script')
        script.id = 'facebook-jssdk'
        script.src = 'https://connect.facebook.net/en_US/sdk.js'
        script.async = true
        script.defer = true
        script.onerror = () => reject(new Error('Meta SDK failed to load.'))
        document.body.appendChild(script)
    })
}

export function subscribeToEmbeddedSignupEvents(timeoutMs = 180000) {
    let settled = false
    let timer = 0

    const cleanup = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        window.removeEventListener('message', onMessage)
    }

    let resolvePromise: (event: MetaEmbeddedSignupEvent) => void = () => undefined
    let rejectPromise: (error: Error) => void = () => undefined

    const onMessage = (event: MessageEvent) => {
        const parsed = parseMetaEmbeddedSignupMessage(event.origin, event.data)
        if (!parsed) return
        cleanup()
        resolvePromise(parsed)
    }

    const promise = new Promise<MetaEmbeddedSignupEvent>((resolve, reject) => {
        resolvePromise = resolve
        rejectPromise = reject
    })

    window.addEventListener('message', onMessage)
    timer = window.setTimeout(() => {
        cleanup()
        rejectPromise(new Error(EMBEDDED_SIGNUP_STATUS_TIMEOUT_MESSAGE))
    }, timeoutMs)

    return {
        promise,
        cancel: cleanup
    }
}
