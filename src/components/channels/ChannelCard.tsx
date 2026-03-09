'use client'

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
    if (tone === 'emerald') return 'border-slate-200 hover:border-slate-300'
    if (tone === 'sky') return 'border-slate-200 hover:border-slate-300'
    if (tone === 'sunset') return 'border-slate-200 hover:border-slate-300'
    return 'border-slate-200 hover:border-slate-300'
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

function getStatusVariant(isConnected: boolean, isComingSoon: boolean) {
    if (isConnected) return 'success'
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
    isReadOnly = false
}: ChannelCardProps) {
    const t = useTranslations('Channels')
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

    const isConnected = !!channel
    const connectLabel = isComingSoon ? t('actions.learnMore') : t('actions.connect')
    const showComingSoonBadge = !isConnected && (badge === 'comingSoon' || isComingSoon)
    const showFooterBadge = isConnected || showComingSoonBadge
    const statusLabel = isConnected
        ? t('status.active')
        : showComingSoonBadge
            ? t('actions.comingSoon')
            : t('status.notConnected')

    return (
        <>
            <article
                className={cn(
                    'group relative flex min-h-[212px] flex-col overflow-hidden rounded-[22px] border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                    getChannelSurfaceClasses(tone)
                )}
                style={getChannelSurfaceStyle(tone)}
            >
                <img
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute right-4 top-4 h-11 w-11 shrink-0 object-contain"
                    src={getChannelPlatformIconSrc(type)}
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
                    </div>

                    <div className="mt-auto pt-4">
                        <div className="h-px w-full bg-slate-200/90" />
                        <div className="flex items-center justify-between gap-3 pt-3">
                            <div className="min-w-0">
                                {showFooterBadge && (
                                    <Badge variant={getStatusVariant(isConnected, showComingSoonBadge)}>
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
