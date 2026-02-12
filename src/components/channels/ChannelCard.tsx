'use client'

import { Channel } from '@/types/database'
import { useState } from 'react'
import { Bug } from 'lucide-react'
import { debugInstagramChannel, debugTelegramChannel, debugWhatsAppChannel, disconnectChannel } from '@/lib/channels/actions'
import { Button, Badge } from '@/design'
import { ConfirmDialog } from '@/design/primitives'
import { useTranslations } from 'next-intl'
import type { ChannelCardType } from '@/components/channels/channelCards'
import { getChannelPlatformIconSrc } from '@/lib/channels/platform-icons'

interface ChannelCardProps {
    channel?: Channel
    type: ChannelCardType
    onConnect: () => void
    isComingSoon?: boolean
    isReadOnly?: boolean
}

function getChannelSurfaceClasses(type: ChannelCardType) {
    if (type === 'telegram') return 'bg-blue-50'
    if (type === 'whatsapp') return 'bg-green-50'
    if (type === 'instagram') return 'bg-pink-50'
    return 'bg-[#0084FF]/10'
}

function getChannelIcon(type: ChannelCardType) {
    return (
        <img
            alt=""
            aria-hidden
            className="h-7 w-7"
            src={getChannelPlatformIconSrc(type)}
        />
    )
}

export function ChannelCard({ channel, type, onConnect, isComingSoon = false, isReadOnly = false }: ChannelCardProps) {
    const t = useTranslations('Channels')
    const [isDisconnecting, setIsDisconnecting] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const handleDebug = async () => {
        if (!channel) return
        if (type === 'messenger') return

        const result = type === 'telegram'
            ? await debugTelegramChannel(channel.id)
            : type === 'whatsapp'
                ? await debugWhatsAppChannel(channel.id)
                : await debugInstagramChannel(channel.id)
        if (result.success) {
            alert(t('debug.webhookInfo', { info: JSON.stringify(result.info, null, 2) }))
        } else {
            alert(t('debug.webhookFailed', { error: result.error }))
        }
    }

    const handleDisconnect = async () => {
        if (isReadOnly) return
        if (!channel) return

        setIsDisconnecting(true)
        try {
            await disconnectChannel(channel.id)
            setShowConfirm(false)
        } catch {
            console.error('Failed to disconnect')
        } finally {
            setIsDisconnecting(false)
        }
    }

    const isConnected = !!channel
    const connectLabel = isComingSoon ? t('actions.comingSoon') : t('actions.connect')
    const statusVariant = isConnected ? 'success' : 'neutral'
    const statusLabel = isConnected ? t('status.active') : t('status.notConnected')

    return (
        <>
            <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4 sm:flex-1 min-w-0">
                    <div className={`w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center ${getChannelSurfaceClasses(type)}`}>
                        {getChannelIcon(type)}
                    </div>

                    <div className="min-w-0 flex-1 text-left">
                        <h3 className="text-base font-semibold text-gray-900">{t(`types.${type}`)}</h3>
                        {isConnected ? (
                            <p className="text-sm text-gray-600 mt-1 break-words">{channel.name}</p>
                        ) : (
                            <p className="text-sm text-gray-500 mt-1">{t('status.notConnected')}</p>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-3 sm:items-end sm:ml-auto sm:shrink-0">
                    <Badge variant={statusVariant}>{statusLabel}</Badge>

                    {isConnected ? (
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button
                                onClick={() => setShowConfirm(true)}
                                disabled={isDisconnecting || isReadOnly}
                                variant="danger"
                                className="w-full sm:w-auto sm:min-w-[160px]"
                            >
                                {t('actions.disconnect')}
                            </Button>

                            {type !== 'messenger' && (
                                <Button
                                    onClick={handleDebug}
                                    disabled={isReadOnly}
                                    variant="outline"
                                    size="icon"
                                    title={t('debug.tooltip')}
                                    aria-label={t('debug.tooltip')}
                                >
                                    <Bug size={16} />
                                </Button>
                            )}
                        </div>
                    ) : (
                        <Button
                            onClick={onConnect}
                            disabled={isReadOnly || isComingSoon}
                            variant="secondary"
                            className="w-full sm:w-auto sm:min-w-[160px]"
                        >
                            {connectLabel}
                        </Button>
                    )}
                </div>
            </div>

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
