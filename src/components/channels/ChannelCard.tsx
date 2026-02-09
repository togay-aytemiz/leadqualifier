'use client'

import { Channel } from '@/types/database'
import { useState } from 'react'
import { Bug } from 'lucide-react'
import { debugInstagramChannel, debugTelegramChannel, debugWhatsAppChannel, disconnectChannel } from '@/lib/channels/actions'
import { Button, Badge } from '@/design'
import { ConfirmDialog } from '@/design/primitives'
import { useTranslations } from 'next-intl'
import { RiTelegramFill, RiWhatsappFill, RiInstagramFill } from 'react-icons/ri'

interface ChannelCardProps {
    channel?: Channel
    type: 'telegram' | 'whatsapp' | 'instagram'
    onConnect: () => void
    isReadOnly?: boolean
}

export function ChannelCard({ channel, type, onConnect, isReadOnly = false }: ChannelCardProps) {
    const t = useTranslations('Channels')
    const [isDisconnecting, setIsDisconnecting] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const handleDebug = async () => {
        if (!channel) return
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

    return (
        <>
            <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center text-center relative overflow-hidden group shadow-sm hover:shadow-md transition-shadow">
                {isConnected && (
                    <button
                        onClick={handleDebug}
                        disabled={isReadOnly}
                        className="absolute top-2 right-2 text-gray-300 hover:text-gray-500 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('debug.tooltip')}
                    >
                        <Bug size={16} />
                    </button>
                )}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${type === 'telegram' ? 'bg-blue-50' : type === 'whatsapp' ? 'bg-green-50' : 'bg-pink-50'
                    }`}>
                    {type === 'telegram' ? (
                        <RiTelegramFill className="text-[#229ED9]" size={28} />
                    ) : type === 'whatsapp' ? (
                        <RiWhatsappFill className="text-[#25D366]" size={28} />
                    ) : (
                        <RiInstagramFill className="text-[#E1306C]" size={28} />
                    )}
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-1 capitalize">{t(`types.${type}`)}</h3>

                {isConnected ? (
                    <>
                        <p className="text-gray-500 text-sm mb-4 truncate w-full px-4">{channel.name}</p>
                        <div className="mt-auto">
                            <Badge variant="success">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
                                {t('status.active')}
                            </Badge>
                            <div className="mt-4 w-full">
                                <Button
                                    onClick={() => setShowConfirm(true)}
                                    disabled={isDisconnecting || isReadOnly}
                                    variant="danger"
                                    className="w-full"
                                >
                                    {t('actions.disconnect')}
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-gray-400 text-sm mb-6">{t('status.notConnected')}</p>
                        <Button onClick={onConnect} disabled={isReadOnly} variant="secondary" className="mt-auto w-full">
                            {t('actions.connect')}
                        </Button>
                    </>
                )}
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
