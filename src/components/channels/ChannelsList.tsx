'use client'

import { Channel } from '@/types/database'
import { useState } from 'react'
import { ChannelCard } from '@/components/channels/ChannelCard'
import { ConnectTelegramModal } from '@/components/channels/ConnectTelegramModal'
import { ConnectWhatsAppModal, type ConnectWhatsAppFormValues } from '@/components/channels/ConnectWhatsAppModal'
import { connectTelegramChannel, connectWhatsAppChannel } from '@/lib/channels/actions'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface ChannelsListProps {
    channels: Channel[]
    organizationId: string
    showDescription?: boolean
    isReadOnly?: boolean
}

export function ChannelsList({ channels, organizationId, showDescription = true, isReadOnly = false }: ChannelsListProps) {
    const t = useTranslations('Channels')
    const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false)
    const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false)
    const router = useRouter()

    const telegramChannel = channels.find(c => c.type === 'telegram')
    const whatsappChannel = channels.find(c => c.type === 'whatsapp')

    const handleConnectTelegram = async (token: string) => {
        if (isReadOnly) return
        const result = await connectTelegramChannel(organizationId, token)
        if (result.error) {
            throw new Error(result.error)
        }
        router.refresh()
    }

    const handleConnectWhatsApp = async (values: ConnectWhatsAppFormValues) => {
        if (isReadOnly) return
        const result = await connectWhatsAppChannel(organizationId, values)
        if (result.error) {
            throw new Error(result.error)
        }
        router.refresh()
    }

    return (
        <div>
            {showDescription && <p className="text-gray-500 mb-8">{t('description')}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ChannelCard
                    type="telegram"
                    channel={telegramChannel}
                    onConnect={() => setIsTelegramModalOpen(true)}
                    isReadOnly={isReadOnly}
                />

                <ChannelCard
                    type="whatsapp"
                    channel={whatsappChannel}
                    onConnect={() => setIsWhatsAppModalOpen(true)}
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
                    <ConnectWhatsAppModal
                        isOpen={isWhatsAppModalOpen}
                        onClose={() => setIsWhatsAppModalOpen(false)}
                        onConnect={handleConnectWhatsApp}
                    />
                </>
            )}
        </div>
    )
}
