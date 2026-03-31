'use client'

import { useState } from 'react'
import { Bug } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { ChannelOnboardingShell } from '@/components/channels/ChannelOnboardingShell'
import { Alert, Button, Input } from '@/design'
import { ConfirmDialog } from '@/design/primitives'
import { connectTelegramChannel, debugTelegramChannel, disconnectChannel } from '@/lib/channels/actions'
import type { Channel } from '@/types/database'

type TelegramSetupMode = 'new' | 'existing'

interface TelegramOnboardingPageProps {
    organizationId: string
    channel?: Channel
    isReadOnly?: boolean
}

function getLocalizedHref(locale: string, href: string) {
    if (locale === 'tr') return href
    return `/${locale}${href}`
}

export function TelegramOnboardingPage({
    organizationId,
    channel,
    isReadOnly = false
}: TelegramOnboardingPageProps) {
    const t = useTranslations('Channels')
    const locale = useLocale()
    const router = useRouter()
    const sectionTitleClass = 'text-lg font-bold leading-tight text-slate-900'
    const sectionLeadClass = 'mt-2.5 max-w-3xl text-sm leading-6 text-slate-600'

    const [setupMode, setSetupMode] = useState<TelegramSetupMode>('new')
    const [token, setToken] = useState('')
    const [isConnecting, setIsConnecting] = useState(false)
    const [isDisconnecting, setIsDisconnecting] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')

    const handleConnect = async () => {
        if (!token.trim() || isReadOnly) return

        setIsConnecting(true)
        setError('')
        setInfo('')

        try {
            const result = await connectTelegramChannel(organizationId, token)

            if (result.error) {
                throw new Error(result.error)
            }

            setInfo(t('onboarding.telegram.connectedBanner', { name: t('types.telegram') }))
            setToken('')
            router.refresh()
        } catch (connectError) {
            setError(connectError instanceof Error ? connectError.message : t('connectTelegramError'))
        } finally {
            setIsConnecting(false)
        }
    }

    const handleDebug = async () => {
        if (!channel) return

        const result = await debugTelegramChannel(channel.id)
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
            const result = await disconnectChannel(channel.id)
            if (!result.success) {
                setError(result.error)
                return
            }

            setShowConfirm(false)
            router.push(getLocalizedHref(locale, '/settings/channels'))
            router.refresh()
        } catch (disconnectError) {
            setError(disconnectError instanceof Error ? disconnectError.message : t('connectTelegramError'))
        } finally {
            setIsDisconnecting(false)
        }
    }

    const activeOptionClasses = (mode: TelegramSetupMode) => [
        'rounded-xl border px-4 py-2 text-sm font-medium transition-colors',
        setupMode === mode
            ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
            : 'border-transparent bg-transparent text-blue-600 hover:bg-blue-50'
    ].join(' ')

    return (
        <>
            <ChannelOnboardingShell
                channelType="telegram"
                pageTitle={t('onboarding.pageTitle', { channel: t('types.telegram') })}
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
                                    {t('onboarding.telegram.connectedHeading')}
                                </h2>
                                <p className={sectionLeadClass}>
                                    {t('onboarding.telegram.connectedDescription')}
                                </p>
                            </div>

                            <Alert variant="success">
                                {t('onboarding.telegram.connectedBanner', { name: channel.name })}
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
                                    {t('onboarding.telegram.heading')}
                                </h2>
                                <p className={sectionLeadClass}>
                                    {t('onboarding.telegram.subheading')}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button className={activeOptionClasses('new')} onClick={() => setSetupMode('new')} type="button">
                                    {t('onboarding.telegram.options.new')}
                                </button>
                                <button className={activeOptionClasses('existing')} onClick={() => setSetupMode('existing')} type="button">
                                    {t('onboarding.telegram.options.existing')}
                                </button>
                            </div>

                            <Alert variant="info">
                                <p className="mb-2 font-medium">{t('connectTelegramHelpTitle')}</p>
                                <ol className="list-decimal list-inside space-y-1 text-blue-700">
                                    <li>
                                        {t.rich('connectTelegramSteps.step1', {
                                            botFather: (chunks) => <strong>{chunks}</strong>
                                        })}
                                    </li>
                                    <li>
                                        {t.rich('connectTelegramSteps.step2', {
                                            newbot: (chunks) => <code className="rounded bg-blue-100 px-1">{chunks}</code>
                                        })}
                                    </li>
                                    <li>
                                        {t.rich('connectTelegramSteps.step3', {
                                            tokenFormat: (chunks) => <code className="rounded bg-blue-100 px-1">{chunks}</code>
                                        })}
                                    </li>
                                </ol>
                            </Alert>

                            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 lg:p-5">
                                <p className="text-sm leading-6 text-slate-600">
                                    {setupMode === 'new'
                                        ? t('onboarding.telegram.newDescription')
                                        : t('onboarding.telegram.existingDescription')}
                                </p>

                                <div className="mt-4 space-y-3">
                                    <Input
                                        label={t('botTokenLabel')}
                                        value={token}
                                        onChange={(value) => setToken(value)}
                                        placeholder={t('botTokenPlaceholder')}
                                        className="bg-white font-mono"
                                        autoFocus
                                    />

                                    <div className="flex flex-wrap gap-3">
                                        <Button
                                            type="button"
                                            onClick={handleConnect}
                                            disabled={!token.trim() || isConnecting || isReadOnly}
                                        >
                                            {isConnecting ? t('validating') : t('connectBot')}
                                        </Button>
                                    </div>
                                </div>
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
