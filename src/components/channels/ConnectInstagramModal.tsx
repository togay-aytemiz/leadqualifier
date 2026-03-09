'use client'

import { useState } from 'react'
import { Button, Modal } from '@/design'
import { useTranslations } from 'next-intl'

interface ConnectInstagramModalProps {
    isOpen: boolean
    onClose: () => void
    onConnect: () => Promise<void>
}

export function ConnectInstagramModal({ isOpen, onClose, onConnect }: ConnectInstagramModalProps) {
    const t = useTranslations('Channels')
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState('')

    const handleConnect = async () => {
        setIsConnecting(true)
        setError('')

        try {
            await onConnect()
        } catch (err) {
            setError(err instanceof Error ? err.message : t('connectInstagramError'))
        } finally {
            setIsConnecting(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('connectInstagramTitle')}>
            <div className="space-y-5">
                <p className="text-sm text-gray-600">
                    {t('oauthConnectDescriptionInstagram')}
                </p>

                <div className="space-y-3">
                    {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        {t('actions.cancel')}
                    </Button>
                    <Button type="button" onClick={handleConnect} disabled={isConnecting}>
                        {isConnecting ? t('redirecting') : t('connectWithInstagram')}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
