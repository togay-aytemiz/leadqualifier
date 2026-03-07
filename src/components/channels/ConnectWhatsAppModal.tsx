'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Alert, Button, Modal } from '@/design'
import { completeWhatsAppEmbeddedSignupChannel } from '@/lib/channels/actions'
import {
    getMetaEmbeddedSignupConfig,
    parseMetaEmbeddedSignupMessage,
    type MetaEmbeddedSignupMode,
    type MetaEmbeddedSignupEvent
} from '@/lib/channels/meta-embedded-signup'

interface ConnectWhatsAppModalProps {
    isOpen: boolean
    organizationId: string
    onClose: () => void
    onLegacyConnect: () => Promise<void>
}

type WhatsAppConnectPath = 'menu' | 'existing' | 'new' | 'assets'

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

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

function wait(ms: number) {
    return new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), ms)
    })
}

async function loadMetaSdk(appId: string): Promise<MetaSdk> {
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

function subscribeToEmbeddedSignupEvents(timeoutMs = 180000) {
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
        rejectPromise(new Error('Timed out waiting for Meta embedded signup status.'))
    }, timeoutMs)

    return {
        promise,
        cancel: cleanup
    }
}

export function ConnectWhatsAppModal({
    isOpen,
    organizationId,
    onClose,
    onLegacyConnect
}: ConnectWhatsAppModalProps) {
    const t = useTranslations('Channels')
    const router = useRouter()
    const newNumberSignupConfig = getMetaEmbeddedSignupConfig('new')
    const existingNumberSignupConfig = getMetaEmbeddedSignupConfig('existing')
    const [activePath, setActivePath] = useState<WhatsAppConnectPath>('menu')
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')

    const resetState = () => {
        setActivePath('menu')
        setError('')
        setInfo('')
        setIsConnecting(false)
    }

    const handleClose = () => {
        resetState()
        onClose()
    }

    const handleLegacyConnect = async () => {
        setIsConnecting(true)
        setError('')
        setInfo('')

        try {
            await onLegacyConnect()
            handleClose()
        } catch (error) {
            setError(getErrorMessage(error, t('connectWhatsAppError')))
        } finally {
            setIsConnecting(false)
        }
    }

    const handleEmbeddedSignup = async (mode: MetaEmbeddedSignupMode) => {
        const embeddedSignupConfig = mode === 'existing' ? existingNumberSignupConfig : newNumberSignupConfig
        const unavailableMessage = mode === 'existing'
            ? t('whatsappConnect.existingEmbeddedSignupUnavailable')
            : t('whatsappConnect.embeddedSignupUnavailable')

        if (!embeddedSignupConfig) {
            setError(unavailableMessage)
            return
        }

        setIsConnecting(true)
        setError('')
        setInfo('')

        const signupSubscription = subscribeToEmbeddedSignupEvents()

        try {
            const sdk = await loadMetaSdk(embeddedSignupConfig.appId)

            const loginResponse = await new Promise<MetaLoginResponse>((resolve) => {
                sdk.login(resolve, {
                    config_id: embeddedSignupConfig.configId,
                    response_type: 'code',
                    override_default_response_type: true,
                    extras: {
                        feature: 'whatsapp_embedded_signup',
                        sessionInfoVersion: 3
                    }
                })
            })

            const authCode = typeof loginResponse.authResponse?.code === 'string'
                ? loginResponse.authResponse.code.trim()
                : ''

            if (!authCode) {
                const maybeEvent = await Promise.race([
                    signupSubscription.promise.catch(() => null),
                    wait(1200)
                ])

                if (maybeEvent?.type === 'cancel') {
                    setInfo(
                        maybeEvent.currentStep
                            ? t('whatsappConnect.embeddedSignupCancelledStep', { step: maybeEvent.currentStep })
                            : t('whatsappConnect.embeddedSignupCancelled')
                    )
                } else if (maybeEvent?.type === 'error') {
                    setError(t('whatsappConnect.embeddedSignupFailedReason', {
                        reason: maybeEvent.message || t('oauthErrors.unknown')
                    }))
                } else {
                    setInfo(t('whatsappConnect.embeddedSignupCancelled'))
                }
                return
            }

            const signupEvent = await signupSubscription.promise

            if (signupEvent.type === 'cancel') {
                setInfo(
                    signupEvent.currentStep
                        ? t('whatsappConnect.embeddedSignupCancelledStep', { step: signupEvent.currentStep })
                        : t('whatsappConnect.embeddedSignupCancelled')
                )
                return
            }

            if (signupEvent.type === 'error') {
                setError(t('whatsappConnect.embeddedSignupFailedReason', {
                    reason: signupEvent.message || t('oauthErrors.unknown')
                }))
                return
            }

            const result = await completeWhatsAppEmbeddedSignupChannel(organizationId, {
                authCode,
                phoneNumberId: signupEvent.phoneNumberId,
                businessAccountId: signupEvent.businessAccountId
            })

            if (result.error) {
                throw new Error(result.error)
            }

            handleClose()
            router.refresh()
            window.alert(t('whatsappConnect.embeddedSignupSuccess'))
        } catch (error) {
            setError(getErrorMessage(error, t('connectWhatsAppError')))
        } finally {
            signupSubscription.cancel()
            setIsConnecting(false)
        }
    }

    const renderPathContent = () => {
        if (activePath === 'existing') {
            return (
                <div className="space-y-5">
                    <Alert variant="info">
                        <p className="font-medium mb-2">{t('whatsappConnect.existingChecklistTitle')}</p>
                        <ol className="list-decimal list-inside space-y-1 text-blue-700">
                            <li>{t('whatsappConnect.existingChecklist.step1')}</li>
                            <li>{t('whatsappConnect.existingChecklist.step2')}</li>
                            <li>{t('whatsappConnect.existingChecklist.step3')}</li>
                            <li>{t('whatsappConnect.existingChecklist.step4')}</li>
                        </ol>
                    </Alert>

                    <p className="text-sm text-gray-600">{t('whatsappConnect.existingDescriptionLong')}</p>

                    {!existingNumberSignupConfig && (
                        <Alert variant="warning">
                            {t('whatsappConnect.existingEmbeddedSignupUnavailable')}
                        </Alert>
                    )}

                    <div className="flex justify-between gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setActivePath('menu')}>
                            {t('whatsappConnect.back')}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => handleEmbeddedSignup('existing')}
                            disabled={isConnecting || !existingNumberSignupConfig}
                        >
                            {isConnecting ? t('whatsappConnect.connecting') : t('whatsappConnect.startEmbeddedSignup')}
                        </Button>
                    </div>
                </div>
            )
        }

        if (activePath === 'new') {
            return (
                <div className="space-y-5">
                    <Alert variant="info">
                        <p className="font-medium mb-2">{t('whatsappConnect.newChecklistTitle')}</p>
                        <ol className="list-decimal list-inside space-y-1 text-blue-700">
                            <li>{t('whatsappConnect.newChecklist.step1')}</li>
                            <li>{t('whatsappConnect.newChecklist.step2')}</li>
                            <li>{t('whatsappConnect.newChecklist.step3')}</li>
                        </ol>
                    </Alert>

                    <p className="text-sm text-gray-600">{t('whatsappConnect.newDescriptionLong')}</p>

                    {!newNumberSignupConfig && (
                        <Alert variant="warning">
                            {t('whatsappConnect.embeddedSignupUnavailable')}
                        </Alert>
                    )}

                    <div className="flex justify-between gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setActivePath('menu')}>
                            {t('whatsappConnect.back')}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => handleEmbeddedSignup('new')}
                            disabled={isConnecting || !newNumberSignupConfig}
                        >
                            {isConnecting ? t('whatsappConnect.connecting') : t('whatsappConnect.startEmbeddedSignup')}
                        </Button>
                    </div>
                </div>
            )
        }

        if (activePath === 'assets') {
            return (
                <div className="space-y-5">
                    <Alert variant="info">
                        <p className="font-medium mb-2">{t('whatsappConnect.assetsChecklistTitle')}</p>
                        <ol className="list-decimal list-inside space-y-1 text-blue-700">
                            <li>{t('whatsappConnect.assetsChecklist.step1')}</li>
                            <li>{t('whatsappConnect.assetsChecklist.step2')}</li>
                            <li>{t('whatsappConnect.assetsChecklist.step3')}</li>
                        </ol>
                    </Alert>

                    <p className="text-sm text-gray-600">{t('whatsappConnect.assetsDescriptionLong')}</p>

                    <div className="flex justify-between gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setActivePath('menu')}>
                            {t('whatsappConnect.back')}
                        </Button>
                        <Button type="button" onClick={handleLegacyConnect} disabled={isConnecting}>
                            {isConnecting ? t('redirecting') : t('whatsappConnect.startLegacyConnect')}
                        </Button>
                    </div>
                </div>
            )
        }

        return (
            <div className="space-y-4">
                <p className="text-sm text-gray-600">{t('whatsappConnect.choosePathDescription')}</p>

                <button
                    className="w-full rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-green-300 hover:bg-green-50"
                    onClick={() => setActivePath('existing')}
                    type="button"
                >
                    <p className="font-medium text-gray-900">{t('whatsappConnect.options.existingTitle')}</p>
                    <p className="mt-1 text-sm text-gray-600">{t('whatsappConnect.options.existingDescription')}</p>
                </button>

                <button
                    className="w-full rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-green-300 hover:bg-green-50"
                    onClick={() => setActivePath('new')}
                    type="button"
                >
                    <p className="font-medium text-gray-900">{t('whatsappConnect.options.newTitle')}</p>
                    <p className="mt-1 text-sm text-gray-600">{t('whatsappConnect.options.newDescription')}</p>
                </button>

                <button
                    className="w-full rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => setActivePath('assets')}
                    type="button"
                >
                    <p className="font-medium text-gray-900">{t('whatsappConnect.options.assetsTitle')}</p>
                    <p className="mt-1 text-sm text-gray-600">{t('whatsappConnect.options.assetsDescription')}</p>
                </button>
            </div>
        )
    }

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title={t('connectWhatsAppTitle')}>
            <div className="space-y-5">
                {error && <Alert variant="error">{error}</Alert>}
                {info && <Alert variant="info">{info}</Alert>}
                {renderPathContent()}

                {activePath === 'menu' && (
                    <div className="flex justify-end pt-2">
                        <Button type="button" variant="secondary" onClick={handleClose}>
                            {t('actions.cancel')}
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    )
}
