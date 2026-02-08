'use client'

import { useState } from 'react'
import { Alert, Button, Input, Modal } from '@/design'
import { useTranslations } from 'next-intl'

export interface ConnectWhatsAppFormValues {
    phoneNumberId: string
    businessAccountId: string
    permanentAccessToken: string
    appSecret: string
    verifyToken: string
}

interface ConnectWhatsAppModalProps {
    isOpen: boolean
    onClose: () => void
    onConnect: (values: ConnectWhatsAppFormValues) => Promise<void>
}

const INITIAL_VALUES: ConnectWhatsAppFormValues = {
    phoneNumberId: '',
    businessAccountId: '',
    permanentAccessToken: '',
    appSecret: '',
    verifyToken: ''
}

export function ConnectWhatsAppModal({ isOpen, onClose, onConnect }: ConnectWhatsAppModalProps) {
    const t = useTranslations('Channels')
    const [values, setValues] = useState<ConnectWhatsAppFormValues>(INITIAL_VALUES)
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState('')

    const setField = (field: keyof ConnectWhatsAppFormValues, value: string) => {
        setValues((current) => ({
            ...current,
            [field]: value
        }))
    }

    const hasMissingField = Object.values(values).some((value) => value.trim().length === 0)

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (hasMissingField) return

        setIsConnecting(true)
        setError('')

        try {
            await onConnect({
                phoneNumberId: values.phoneNumberId.trim(),
                businessAccountId: values.businessAccountId.trim(),
                permanentAccessToken: values.permanentAccessToken.trim(),
                appSecret: values.appSecret.trim(),
                verifyToken: values.verifyToken.trim()
            })
            setValues(INITIAL_VALUES)
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : t('connectWhatsAppError'))
        } finally {
            setIsConnecting(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('connectWhatsAppTitle')}>
            <form onSubmit={handleSubmit} className="space-y-5">
                <Alert variant="info">
                    <p className="font-medium mb-2">{t('connectWhatsAppHelpTitle')}</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-700">
                        <li>{t('connectWhatsAppSteps.step1')}</li>
                        <li>{t('connectWhatsAppSteps.step2')}</li>
                        <li>{t('connectWhatsAppSteps.step3')}</li>
                    </ol>
                </Alert>

                <div className="space-y-3">
                    <Input
                        label={t('whatsappPhoneNumberIdLabel')}
                        value={values.phoneNumberId}
                        onChange={(value) => setField('phoneNumberId', value)}
                        placeholder={t('whatsappPhoneNumberIdPlaceholder')}
                        autoFocus
                    />
                    <Input
                        label={t('whatsappBusinessAccountIdLabel')}
                        value={values.businessAccountId}
                        onChange={(value) => setField('businessAccountId', value)}
                        placeholder={t('whatsappBusinessAccountIdPlaceholder')}
                    />
                    <Input
                        label={t('whatsappPermanentTokenLabel')}
                        value={values.permanentAccessToken}
                        onChange={(value) => setField('permanentAccessToken', value)}
                        placeholder={t('whatsappPermanentTokenPlaceholder')}
                        type="password"
                        className="font-mono"
                    />
                    <Input
                        label={t('whatsappAppSecretLabel')}
                        value={values.appSecret}
                        onChange={(value) => setField('appSecret', value)}
                        placeholder={t('whatsappAppSecretPlaceholder')}
                        type="password"
                        className="font-mono"
                    />
                    <Input
                        label={t('whatsappVerifyTokenLabel')}
                        value={values.verifyToken}
                        onChange={(value) => setField('verifyToken', value)}
                        placeholder={t('whatsappVerifyTokenPlaceholder')}
                        className="font-mono"
                    />
                    {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        {t('actions.cancel')}
                    </Button>
                    <Button type="submit" disabled={hasMissingField || isConnecting}>
                        {isConnecting ? t('validating') : t('connectWhatsApp')}
                    </Button>
                </div>
            </form>
        </Modal>
    )
}
