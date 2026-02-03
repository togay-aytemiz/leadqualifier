'use client'

import { useState } from 'react'
import { Button, Modal, Input, Alert } from '@/design'
import { useTranslations } from 'next-intl'

interface ConnectTelegramModalProps {
    isOpen: boolean
    onClose: () => void
    onConnect: (token: string) => Promise<void>
}

export function ConnectTelegramModal({ isOpen, onClose, onConnect }: ConnectTelegramModalProps) {
    const t = useTranslations('Channels')
    const [token, setToken] = useState('')
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!token.trim()) return

        setIsConnecting(true)
        setError('')

        try {
            await onConnect(token)
            setToken('')
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : t('connectTelegramError'))
        } finally {
            setIsConnecting(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('connectTelegramTitle')}>
            <form onSubmit={handleSubmit} className="space-y-5">
                <Alert variant="info">
                    <p className="font-medium mb-2">{t('connectTelegramHelpTitle')}</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-700">
                        <li>
                            {t.rich('connectTelegramSteps.step1', {
                                botFather: (chunks) => <strong>{chunks}</strong>
                            })}
                        </li>
                        <li>
                            {t.rich('connectTelegramSteps.step2', {
                                newbot: (chunks) => <code className="bg-blue-100 px-1 rounded">{chunks}</code>
                            })}
                        </li>
                        <li>
                            {t.rich('connectTelegramSteps.step3', {
                                tokenFormat: (chunks) => <code className="bg-blue-100 px-1 rounded">{chunks}</code>
                            })}
                        </li>
                    </ol>
                </Alert>

                <div>
                    <Input
                        label={t('botTokenLabel')}
                        value={token}
                        onChange={(val: string) => setToken(val)}
                        placeholder={t('botTokenPlaceholder')}
                        className="font-mono bg-white"
                        autoFocus
                    />
                    {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>{t('actions.cancel')}</Button>
                    <Button type="submit" disabled={!token.trim() || isConnecting}>
                        {isConnecting ? t('validating') : t('connectBot')}
                    </Button>
                </div>
            </form>
        </Modal>
    )
}
