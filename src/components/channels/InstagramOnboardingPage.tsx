'use client'

import { useEffect, useState } from 'react'
import { Bug } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { ChannelOnboardingShell } from '@/components/channels/ChannelOnboardingShell'
import { useMetaOAuthPopupTransport } from '@/components/channels/useMetaOAuthPopupTransport'
import { Alert, Button } from '@/design'
import { ConfirmDialog } from '@/design/primitives'
import { debugInstagramChannel, disconnectChannel } from '@/lib/channels/actions'
import type { Channel } from '@/types/database'

interface InstagramOnboardingPageProps {
    organizationId: string
    channel?: Channel
    isReadOnly?: boolean
}

function getLocalizedHref(locale: string, href: string) {
    if (locale === 'tr') return href
    return `/${locale}${href}`
}

export function InstagramOnboardingPage({
    organizationId,
    channel,
    isReadOnly = false
}: InstagramOnboardingPageProps) {
    const t = useTranslations('Channels')
    const locale = useLocale()
    const router = useRouter()
    const sectionTitleClass = 'text-lg font-bold leading-tight text-slate-900'
    const sectionLeadClass = 'mt-2.5 max-w-3xl text-sm leading-6 text-slate-600'
    const { popupResult, clearPopupResult, startMetaOAuth } = useMetaOAuthPopupTransport({
        organizationId,
        locale
    })

    const [isConnecting, setIsConnecting] = useState(false)
    const [isDisconnecting, setIsDisconnecting] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')

    useEffect(() => {
        if (!popupResult) return
        if (popupResult.channel && popupResult.channel !== 'instagram') return

        const channelLabel = t('types.instagram')
        const errorMessages = {
            missing_permissions: t('oauthErrors.missingPermissions'),
            invalid_redirect_uri: t('oauthErrors.invalidRedirectUri'),
            invalid_oauth_token: t('oauthErrors.invalidOauthToken'),
            asset_access_denied: t('oauthErrors.assetAccessDenied'),
            graph_api_error: t('oauthErrors.graphApiError'),
            unknown: t('oauthErrors.unknown')
        } as const

        const statusMessages = {
            success: t('oauthStatus.success', { channel: channelLabel }),
            oauth_cancelled: t('oauthStatus.cancelled'),
            missing_instagram_assets: t('oauthStatus.missingInstagramAssets'),
            org_mismatch: t('oauthStatus.orgMismatch'),
            forbidden: t('oauthStatus.forbidden'),
            missing_meta_env: t('oauthStatus.missingMetaEnv'),
            missing_state: t('oauthStatus.invalidState'),
            invalid_state: t('oauthStatus.invalidState'),
            missing_code: t('oauthStatus.missingCode')
        } as const

        const errorReason = popupResult.error
            ? (errorMessages[popupResult.error as keyof typeof errorMessages] ?? errorMessages.unknown)
            : errorMessages.unknown

        const message = popupResult.status === 'connect_failed'
            ? t('oauthStatus.connectFailed', { reason: errorReason })
            : statusMessages[popupResult.status as keyof typeof statusMessages] || t('oauthStatus.genericFailure')

        if (popupResult.status === 'success') {
            setInfo(message)
            setError('')
            router.refresh()
        } else {
            setError(message)
            setInfo('')
        }

        clearPopupResult()
    }, [clearPopupResult, popupResult, router, t])

    const handleConnect = async () => {
        if (isReadOnly) return

        setIsConnecting(true)
        setError('')
        setInfo('')

        try {
            await startMetaOAuth('instagram')
        } catch (connectError) {
            setError(connectError instanceof Error ? connectError.message : t('connectInstagramError'))
        } finally {
            setIsConnecting(false)
        }
    }

    const handleDebug = async () => {
        if (!channel) return

        const result = await debugInstagramChannel(channel.id)
        if (result.success) {
            alert(t('debug.webhookInfo', { info: JSON.stringify(result.info, null, 2) }))
            return
        }

        alert(t('debug.webhookFailed', { error: result.error }))
    }

    const handleDisconnect = async () => {
        if (!channel || isReadOnly) return

        setIsDisconnecting(true)
        try {
            await disconnectChannel(channel.id)
            setShowConfirm(false)
            router.push(getLocalizedHref(locale, '/settings/channels'))
            router.refresh()
        } catch (disconnectError) {
            setError(disconnectError instanceof Error ? disconnectError.message : t('connectInstagramError'))
        } finally {
            setIsDisconnecting(false)
        }
    }

    return (
        <>
            <ChannelOnboardingShell
                pageTitle={t('onboarding.pageTitle', { channel: t('types.instagram') })}
                backHref={getLocalizedHref(locale, '/settings/channels')}
                backLabel={t('onboarding.back')}
            >
                <div className="space-y-6">
                    {error && <Alert variant="error">{error}</Alert>}
                    {info && <Alert variant="info">{info}</Alert>}

                    {channel ? (
                        <div className="space-y-6">
                            <div>
                                <h2 className={sectionTitleClass}>
                                    {t('onboarding.instagram.connectedHeading')}
                                </h2>
                                <p className={sectionLeadClass}>
                                    {t('onboarding.instagram.connectedDescription')}
                                </p>
                            </div>

                            <Alert variant="success">
                                {t('onboarding.instagram.connectedBanner', { name: channel.name })}
                            </Alert>

                            <div className="flex flex-wrap gap-3">
                                <Button onClick={handleDebug} disabled={isReadOnly} variant="outline">
                                    <Bug size={16} className="mr-2" />
                                    {t('debug.tooltip')}
                                </Button>
                                <Button
                                    onClick={() => setShowConfirm(true)}
                                    disabled={isDisconnecting || isReadOnly}
                                    variant="danger"
                                >
                                    {t('actions.disconnect')}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <h2 className={sectionTitleClass}>
                                    {t('onboarding.instagram.heading')}
                                </h2>
                                <p className={sectionLeadClass}>
                                    {t('onboarding.instagram.subheading')}
                                </p>
                            </div>

                            <div>
                                <Button
                                    type="button"
                                    onClick={handleConnect}
                                    disabled={isConnecting || isReadOnly}
                                >
                                    {isConnecting ? t('redirecting') : t('connectWithInstagram')}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </ChannelOnboardingShell>

            {!isReadOnly && (
                <ConfirmDialog
                    isOpen={showConfirm}
                    title={t('confirmDisconnectTitle')}
                    description={t('confirmDisconnectDesc')}
                    confirmText={t('actions.disconnect')}
                    cancelText={t('actions.cancel')}
                    isDestructive
                    isLoading={isDisconnecting}
                    onConfirm={handleDisconnect}
                    onCancel={() => setShowConfirm(false)}
                />
            )}
        </>
    )
}
