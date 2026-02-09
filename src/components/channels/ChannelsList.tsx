'use client'

import { Channel } from '@/types/database'
import { useState } from 'react'
import { ChannelCard } from '@/components/channels/ChannelCard'
import { ConnectTelegramModal } from '@/components/channels/ConnectTelegramModal'
import { connectTelegramChannel } from '@/lib/channels/actions'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'

interface ChannelsListProps {
    channels: Channel[]
    organizationId: string
    showDescription?: boolean
    isReadOnly?: boolean
}

export function ChannelsList({ channels, organizationId, showDescription = true, isReadOnly = false }: ChannelsListProps) {
    const t = useTranslations('Channels')
    const locale = useLocale()
    const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false)
    const router = useRouter()

    const telegramChannel = channels.find(c => c.type === 'telegram')
    const whatsappChannel = channels.find(c => c.type === 'whatsapp')
    const instagramChannel = channels.find(c => c.type === 'instagram')

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
            returnTo: window.location.pathname
        })
        window.location.href = `/api/channels/meta/start?${params.toString()}`
    }

    return (
        <div>
            {showDescription && <p className="text-gray-500 mb-8">{t('description')}</p>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ChannelCard
                    type="telegram"
                    channel={telegramChannel}
                    onConnect={() => setIsTelegramModalOpen(true)}
                    isReadOnly={isReadOnly}
                />

                <ChannelCard
                    type="whatsapp"
                    channel={whatsappChannel}
                    onConnect={() => startMetaOAuth('whatsapp')}
                    isReadOnly={isReadOnly}
                />

                <ChannelCard
                    type="instagram"
                    channel={instagramChannel}
                    onConnect={() => startMetaOAuth('instagram')}
                    isReadOnly={isReadOnly}
                />
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
