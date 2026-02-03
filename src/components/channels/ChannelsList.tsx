'use client'

import { Channel } from '@/types/database'
import { useState } from 'react'
import { ChannelCard } from '@/components/channels/ChannelCard'
import { ConnectTelegramModal } from '@/components/channels/ConnectTelegramModal'
import { connectTelegramChannel } from '@/lib/channels/actions'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface ChannelsListProps {
    channels: Channel[]
    organizationId: string
}

export function ChannelsList({ channels, organizationId }: ChannelsListProps) {
    const t = useTranslations('Channels')
    const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false)
    const router = useRouter()

    const telegramChannel = channels.find(c => c.type === 'telegram')
    const whatsappChannel = channels.find(c => c.type === 'whatsapp')

    const handleConnectTelegram = async (token: string) => {
        const result = await connectTelegramChannel(organizationId, token)
        if (result.error) {
            throw new Error(result.error)
        }
        router.refresh()
    }

    const handleConnectWhatsApp = () => {
        alert(t('whatsappComingSoon'))
    }

    return (
        <div className="max-w-4xl">
            <p className="text-gray-500 mb-8">{t('description')}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ChannelCard
                    type="telegram"
                    channel={telegramChannel}
                    onConnect={() => setIsTelegramModalOpen(true)}
                />

                <ChannelCard
                    type="whatsapp"
                    channel={whatsappChannel}
                    onConnect={handleConnectWhatsApp}
                />
            </div>

            <ConnectTelegramModal
                isOpen={isTelegramModalOpen}
                onClose={() => setIsTelegramModalOpen(false)}
                onConnect={handleConnectTelegram}
            />
        </div>
    )
}
