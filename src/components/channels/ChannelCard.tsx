'use client'

import { useState } from 'react'
import { Bug, FileText } from 'lucide-react'

import { Button, Badge } from '@/design'
import { ConfirmDialog } from '@/design/primitives'
import type {
    ChannelCardBadge,
    ChannelCardTone,
    ChannelCardType
} from '@/components/channels/channelCatalog'
import { WhatsAppTemplateModal } from '@/components/channels/WhatsAppTemplateModal'
import { debugInstagramChannel, debugTelegramChannel, debugWhatsAppChannel, disconnectChannel } from '@/lib/channels/actions'
import { getChannelPlatformIconSrc } from '@/lib/channels/platform-icons'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import type { Channel } from '@/types/database'

interface ChannelCardProps {
    channel?: Channel
    type: ChannelCardType
    tone: ChannelCardTone
    badge?: ChannelCardBadge
    onConnect: () => void
    isComingSoon?: boolean
    isReadOnly?: boolean
}

function getChannelSurfaceClasses(tone: ChannelCardTone) {
    if (tone === 'emerald') {
        return 'border-slate-200 bg-[linear-gradient(135deg,rgba(22,163,74,0.06)_0%,rgba(255,255,255,0)_42%),linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,249,0.98))] hover:border-slate-300'
    }
    if (tone === 'sky') {
        return 'border-slate-200 bg-[linear-gradient(135deg,rgba(37,99,235,0.06)_0%,rgba(255,255,255,0)_42%),linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.98))] hover:border-slate-300'
    }
    if (tone === 'sunset') {
        return 'border-slate-200 bg-[linear-gradient(135deg,rgba(244,114,182,0.05)_0%,rgba(255,255,255,0)_42%),linear-gradient(180deg,rgba(255,255,255,1),rgba(252,248,250,0.98))] hover:border-slate-300'
    }
    return 'border-slate-200 bg-[linear-gradient(135deg,rgba(99,102,241,0.05)_0%,rgba(255,255,255,0)_42%),linear-gradient(180deg,rgba(255,255,255,1),rgba(248,249,252,0.98))] hover:border-slate-300'
}

function getBadgeVariant(badge?: ChannelCardBadge) {
    if (badge === 'popular') return 'success'
    if (badge === 'comingSoon') return 'info'
    return 'neutral'
}

function getStatusVariant(isConnected: boolean, isComingSoon: boolean) {
    if (isConnected) return 'success'
    if (isComingSoon) return 'info'
    return 'neutral'
}

export function ChannelCard({
    channel,
    type,
    tone,
    badge,
    onConnect,
    isComingSoon = false,
    isReadOnly = false
}: ChannelCardProps) {
    const t = useTranslations('Channels')
    const [isDisconnecting, setIsDisconnecting] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [showTemplateModal, setShowTemplateModal] = useState(false)

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
            return
        }

        alert(t('debug.webhookFailed', { error: result.error }))
    }

    const handleDisconnect = async () => {
        if (isReadOnly || !channel) return

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
    const connectLabel = isComingSoon ? t('actions.learnMore') : t('actions.connect')
    const statusLabel = isConnected
        ? t('status.active')
        : isComingSoon
            ? t('actions.comingSoon')
            : t('status.notConnected')

    return (
        <>
            <article
                className={cn(
                    'group relative flex min-h-[212px] flex-col overflow-hidden rounded-[22px] border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                    getChannelSurfaceClasses(tone)
                )}
            >
                {badge && (
                    <div className="absolute left-4 top-4">
                        <Badge variant={getBadgeVariant(badge)}>
                            {t(`gallery.badges.${badge}`)}
                        </Badge>
                    </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col pt-6">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 pr-3">
                            <h3 className="text-[16px] font-semibold leading-[1.25] tracking-tight text-slate-900 sm:text-[17px]">
                                {t(`types.${type}`)}
                            </h3>
                            <p className="mt-2 max-w-[40ch] text-[13px] leading-5 text-slate-600">
                                {t(`gallery.cards.${type}.description`)}
                            </p>
                            {isConnected && (
                                <p className="mt-3 text-xs font-medium text-slate-700">
                                    {t('gallery.connectedAs', { name: channel.name })}
                                </p>
                            )}
                        </div>

                        <img
                            alt=""
                            aria-hidden
                            className="h-11 w-11 shrink-0 object-contain"
                            src={getChannelPlatformIconSrc(type)}
                        />
                    </div>

                    <div className="mt-auto pt-4">
                        <div className="h-px w-full bg-slate-200/90" />
                        <div className="flex items-center justify-between gap-3 pt-3">
                            <div className="min-w-0">
                                {isConnected && (
                                    <Badge variant={getStatusVariant(isConnected, isComingSoon)}>
                                        {statusLabel}
                                    </Badge>
                                )}
                            </div>

                            {isConnected ? (
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    {type === 'whatsapp' && (
                                        <Button
                                            onClick={() => setShowTemplateModal(true)}
                                            disabled={isReadOnly}
                                            variant="outline"
                                            size="icon"
                                            title={t('templateTools.openAction')}
                                            aria-label={t('templateTools.openAction')}
                                        >
                                            <FileText size={16} />
                                        </Button>
                                    )}

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

                                    <Button
                                        onClick={() => setShowConfirm(true)}
                                        disabled={isDisconnecting || isReadOnly}
                                        variant="danger"
                                        size="sm"
                                    >
                                        {t('actions.disconnect')}
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    onClick={onConnect}
                                    disabled={isReadOnly}
                                    variant="secondary"
                                    size="sm"
                                    className="min-w-[112px] bg-white"
                                >
                                    {connectLabel}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </article>

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

            {channel && type === 'whatsapp' && (
                <WhatsAppTemplateModal
                    channelId={channel.id}
                    isOpen={showTemplateModal}
                    isReadOnly={isReadOnly}
                    onClose={() => setShowTemplateModal(false)}
                />
            )}
        </>
    )
}
