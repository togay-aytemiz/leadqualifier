'use client'

import { Channel } from '@/types/database'
import { useEffect, useState } from 'react'
import { ChannelCard } from '@/components/channels/ChannelCard'
import { ConnectTelegramModal } from '@/components/channels/ConnectTelegramModal'
import { connectTelegramChannel } from '@/lib/channels/actions'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { getChannelCardConfigs, getChannelsListLayoutClasses, type ChannelCardType } from '@/components/channels/channelCards'

interface ChannelsListProps {
    channels: Channel[]
    organizationId: string
    showDescription?: boolean
    isReadOnly?: boolean
}

export function ChannelsList({ channels, organizationId, showDescription = true, isReadOnly = false }: ChannelsListProps) {
    const t = useTranslations('Channels')
    const locale = useLocale()
    const searchParams = useSearchParams()
    const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false)
    const router = useRouter()

    const handleConnectTelegram = async (token: string) => {
        if (isReadOnly) return
        const result = await connectTelegramChannel(organizationId, token)
        if (result.error) {
            throw new Error(result.error)
        }
        router.refresh()
    }

    const startMetaOAuth = async (channel: 'whatsapp' | 'instagram') => {
        if (isReadOnly) return
        const params = new URLSearchParams({
            channel,
            organizationId,
            locale,
            returnTo: window.location.pathname,
            popup: '1'
        })
        const startUrl = `/api/channels/meta/start?${params.toString()}`
        const popupWindow = window.open(
            startUrl,
            `meta_oauth_${channel}`,
            'popup=yes,width=560,height=720,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes,status=no'
        )

        if (!popupWindow) {
            window.location.assign(startUrl)
        }
    }

    useEffect(() => {
        const status = searchParams.get('meta_oauth')
        const channel = searchParams.get('channel')
        const error = searchParams.get('meta_oauth_error')
        const isMetaPopup = searchParams.get('meta_oauth_popup') === '1'

        if (!status || !isMetaPopup) return
        if (!window.opener || window.opener.closed) return

        window.opener.postMessage({
            source: 'meta-oauth',
            status,
            channel,
            error
        }, window.location.origin)
        window.close()
    }, [searchParams])

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return
            const payload = event.data as { source?: string, status?: string, channel?: string, error?: string | null } | null
            if (!payload || payload.source !== 'meta-oauth' || !payload.status) return

            const url = new URL(window.location.href)
            url.searchParams.set('meta_oauth', payload.status)
            if (payload.channel) {
                url.searchParams.set('channel', payload.channel)
            }
            if (payload.error) {
                url.searchParams.set('meta_oauth_error', payload.error)
            } else {
                url.searchParams.delete('meta_oauth_error')
            }
            url.searchParams.delete('meta_oauth_popup')

            window.location.assign(url.toString())
        }

        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [])

    const channelCards = getChannelCardConfigs(channels)
    const channelsListLayoutClasses = getChannelsListLayoutClasses()

    const getConnectHandler = (type: ChannelCardType) => {
        if (type === 'telegram') return () => setIsTelegramModalOpen(true)
        if (type === 'whatsapp') return () => startMetaOAuth('whatsapp')
        return () => undefined
    }

    return (
        <div>
            {showDescription && <p className="text-gray-500 mb-8">{t('description')}</p>}

            <div className={channelsListLayoutClasses}>
                {channelCards.map(card => (
                    <ChannelCard
                        key={card.type}
                        type={card.type}
                        channel={card.channel}
                        onConnect={getConnectHandler(card.type)}
                        isComingSoon={card.isComingSoon}
                        isReadOnly={isReadOnly}
                    />
                ))}
            </div>

            {!isReadOnly && (
                <>
                    <ConnectTelegramModal
                        isOpen={isTelegramModalOpen}
                        onClose={() => setIsTelegramModalOpen(false)}
                        onConnect={handleConnectTelegram}
                    />
                </>
            )}
        </div>
    )
}
