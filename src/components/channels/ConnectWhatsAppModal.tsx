'use client'

import { useState } from 'react'
import { Alert, Button, Modal } from '@/design'
import { useTranslations } from 'next-intl'

interface ConnectWhatsAppModalProps {
    isOpen: boolean
    onClose: () => void
    onConnect: () => Promise<void>
}

export function ConnectWhatsAppModal({ isOpen, onClose, onConnect }: ConnectWhatsAppModalProps) {
    const t = useTranslations('Channels')
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState('')

    const handleConnect = async () => {
        setIsConnecting(true)
        setError('')

        try {
            await onConnect()
        } catch (err) {
            setError(err instanceof Error ? err.message : t('connectWhatsAppError'))
        } finally {
            setIsConnecting(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('connectWhatsAppTitle')}>
            <div className="space-y-5">
                <Alert variant="info">
                    <p className="font-medium mb-2">{t('connectWhatsAppHelpTitle')}</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-700">
                        <li>{t('connectWhatsAppSteps.step1')}</li>
                        <li>{t('connectWhatsAppSteps.step2')}</li>
                        <li>{t('connectWhatsAppSteps.step3')}</li>
                    </ol>
                </Alert>

                <p className="text-sm text-gray-600">
                    {t('oauthConnectDescription')}
                </p>

                <div className="space-y-3">
                    {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        {t('actions.cancel')}
                    </Button>
                    <Button type="button" onClick={handleConnect} disabled={isConnecting}>
                        {isConnecting ? t('redirecting') : t('connectWithMeta')}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
