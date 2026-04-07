'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Bug, FileText } from 'lucide-react'

import { Button, Badge } from '@/design'
import type {
    ChannelCardBadge,
    ChannelCardTone,
    ChannelCardType
} from '@/components/channels/channelCatalog'
import { WhatsAppTemplateModal } from '@/components/channels/WhatsAppTemplateModal'
import { MetaProviderBadge } from '@/components/channels/MetaProviderBadge'
import { debugInstagramChannel, debugTelegramChannel, debugWhatsAppChannel } from '@/lib/channels/actions'
import { getChannelConnectionState } from '@/lib/channels/connection-readiness'
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
    isConnectLocked?: boolean
}

function getChannelSurfaceClasses(tone: ChannelCardTone, isConnectLocked: boolean) {
    if (tone === 'emerald') return isConnectLocked ? 'border-slate-200' : 'border-slate-200 hover:border-slate-300'
    if (tone === 'sky') return isConnectLocked ? 'border-slate-200' : 'border-slate-200 hover:border-slate-300'
    if (tone === 'sunset') return isConnectLocked ? 'border-slate-200' : 'border-slate-200 hover:border-slate-300'
    return isConnectLocked ? 'border-slate-200' : 'border-slate-200 hover:border-slate-300'
}

function getChannelSurfaceStyle(tone: ChannelCardTone) {
    const iconCenter = 'calc(100% - 2.375rem) 2.375rem'

    if (tone === 'emerald') {
        return {
            backgroundImage: `radial-gradient(230px circle at ${iconCenter}, rgba(34,197,94,0.24) 0%, rgba(34,197,94,0.12) 26%, rgba(34,197,94,0.04) 48%, rgba(34,197,94,0) 74%), linear-gradient(180deg, rgba(255,255,255,1), rgba(248,250,249,0.98))`
        }
    }

    if (tone === 'sky') {
        return {
            backgroundImage: `radial-gradient(230px circle at ${iconCenter}, rgba(56,189,248,0.26) 0%, rgba(56,189,248,0.12) 26%, rgba(56,189,248,0.04) 48%, rgba(56,189,248,0) 74%), linear-gradient(180deg, rgba(255,255,255,1), rgba(248,250,252,0.98))`
        }
    }

    if (tone === 'sunset') {
        return {
            backgroundImage: `radial-gradient(230px circle at ${iconCenter}, rgba(236,72,153,0.26) 0%, rgba(249,115,22,0.1) 26%, rgba(236,72,153,0.04) 48%, rgba(236,72,153,0) 74%), linear-gradient(180deg, rgba(255,255,255,1), rgba(252,248,250,0.98))`
        }
    }

    return {
        backgroundImage: `radial-gradient(230px circle at ${iconCenter}, rgba(99,102,241,0.24) 0%, rgba(99,102,241,0.11) 26%, rgba(99,102,241,0.04) 48%, rgba(99,102,241,0) 74%), linear-gradient(180deg, rgba(255,255,255,1), rgba(248,249,252,0.98))`
    }
}

function getStatusVariant(connectionState: 'not_connected' | 'ready' | 'pending' | 'error', isComingSoon: boolean) {
    if (connectionState === 'ready') return 'success'
    if (connectionState === 'pending') return 'warning'
    if (connectionState === 'error') return 'error'
    if (isComingSoon) return 'info'
    return 'neutral'
}

function isMetaProductChannel(type: ChannelCardType) {
    return type === 'whatsapp' || type === 'instagram' || type === 'messenger'
}

export function ChannelCard({
    channel,
    type,
    tone,
    badge,
    onConnect,
    isComingSoon = false,
    isReadOnly = false,
    isConnectLocked = false
}: ChannelCardProps) {
    const t = useTranslations('Channels')
    const [showTemplateModal, setShowTemplateModal] = useState(false)
    const connectionState = getChannelConnectionState(channel)

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

    const isConnected = !!channel
    const showPendingVerificationHelp =
        isConnected
        && connectionState === 'pending'
        && (type === 'whatsapp' || type === 'instagram')
    const connectLabel = isComingSoon ? t('actions.learnMore') : t('actions.connect')
    const showComingSoonBadge = !isConnected && (badge === 'comingSoon' || isComingSoon)
    const showFooterBadge = isConnected || showComingSoonBadge
    const statusLabel = isConnected
        ? connectionState === 'ready'
            ? t('status.active')
            : connectionState === 'pending'
                ? t('status.pending')
                : t('status.needsAttention')
        : showComingSoonBadge
            ? t('actions.comingSoon')
            : t('status.notConnected')

    return (
        <>
            <article
                className={cn(
                    'group relative flex min-h-[212px] flex-col overflow-hidden rounded-[22px] border p-5 shadow-sm transition-all duration-200',
                    !isConnectLocked && 'hover:-translate-y-0.5 hover:shadow-md',
                    isConnectLocked && 'cursor-not-allowed opacity-80',
                    getChannelSurfaceClasses(tone, isConnectLocked)
                )}
                style={getChannelSurfaceStyle(tone)}
            >
                <Image
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute right-4 top-4 h-11 w-11 shrink-0 object-contain"
                    src={getChannelPlatformIconSrc(type)}
                    width={44}
                    height={44}
                />

                <div className="flex min-h-0 flex-1 flex-col pt-2">
                    <div className="min-w-0 pr-14">
                        <h3 className="text-[16px] font-semibold leading-[1.25] tracking-tight text-slate-900 sm:text-[17px]">
                            {t(`types.${type}`)}
                        </h3>
                        {isMetaProductChannel(type) && (
                            <MetaProviderBadge
                                label={t('trust.metaProvider')}
                                className="mt-2"
                                size="sm"
                            />
                        )}
                        <p className="mt-2 max-w-[40ch] text-[13px] leading-5 text-slate-600">
                            {t(`gallery.cards.${type}.description`)}
                        </p>
                        {isConnected && (
                            <p className="mt-3 text-xs font-medium text-slate-700">
                                {t('gallery.connectedAs', { name: channel.name })}
                            </p>
                        )}
                        {showPendingVerificationHelp && (
                            <div className="mt-3 rounded-2xl border border-amber-200/90 bg-amber-50/90 p-3">
                                <p className="text-xs font-semibold text-amber-900">
                                    {t('gallery.pendingVerificationTitle')}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-amber-800">
                                    {t('gallery.pendingVerificationDescription')}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="mt-auto pt-4">
                        <div className="h-px w-full bg-slate-200/90" />
                        <div className="flex items-center justify-between gap-3 pt-3">
                            <div className="min-w-0">
                                {showFooterBadge && (
                                    <Badge variant={getStatusVariant(connectionState, showComingSoonBadge)}>
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
                                        onClick={onConnect}
                                        variant="secondary"
                                        size="sm"
                                        className="min-w-[112px] bg-white"
                                    >
                                        {t('actions.manage')}
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    onClick={onConnect}
                                    disabled={isReadOnly || isConnectLocked}
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
