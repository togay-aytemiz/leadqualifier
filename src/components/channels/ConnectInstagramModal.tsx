'use client'

import { useState } from 'react'
import { Alert, Button, Input, Modal } from '@/design'
import { useTranslations } from 'next-intl'

export interface ConnectInstagramFormValues {
    pageId: string
    instagramBusinessAccountId: string
    pageAccessToken: string
    appSecret: string
    verifyToken: string
}

interface ConnectInstagramModalProps {
    isOpen: boolean
    onClose: () => void
    onConnect: (values: ConnectInstagramFormValues) => Promise<void>
}

const INITIAL_VALUES: ConnectInstagramFormValues = {
    pageId: '',
    instagramBusinessAccountId: '',
    pageAccessToken: '',
    appSecret: '',
    verifyToken: ''
}

export function ConnectInstagramModal({ isOpen, onClose, onConnect }: ConnectInstagramModalProps) {
    const t = useTranslations('Channels')
    const [values, setValues] = useState<ConnectInstagramFormValues>(INITIAL_VALUES)
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState('')

    const setField = (field: keyof ConnectInstagramFormValues, value: string) => {
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
                pageId: values.pageId.trim(),
                instagramBusinessAccountId: values.instagramBusinessAccountId.trim(),
                pageAccessToken: values.pageAccessToken.trim(),
                appSecret: values.appSecret.trim(),
                verifyToken: values.verifyToken.trim()
            })
            setValues(INITIAL_VALUES)
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : t('connectInstagramError'))
        } finally {
            setIsConnecting(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('connectInstagramTitle')}>
            <form onSubmit={handleSubmit} className="space-y-5">
                <Alert variant="info">
                    <p className="font-medium mb-2">{t('connectInstagramHelpTitle')}</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-700">
                        <li>{t('connectInstagramSteps.step1')}</li>
                        <li>{t('connectInstagramSteps.step2')}</li>
                        <li>{t('connectInstagramSteps.step3')}</li>
                    </ol>
                </Alert>

                <div className="space-y-3">
                    <Input
                        label={t('instagramPageIdLabel')}
                        value={values.pageId}
                        onChange={(value) => setField('pageId', value)}
                        placeholder={t('instagramPageIdPlaceholder')}
                        autoFocus
                    />
                    <Input
                        label={t('instagramBusinessAccountIdLabel')}
                        value={values.instagramBusinessAccountId}
                        onChange={(value) => setField('instagramBusinessAccountId', value)}
                        placeholder={t('instagramBusinessAccountIdPlaceholder')}
                    />
                    <Input
                        label={t('instagramPageAccessTokenLabel')}
                        value={values.pageAccessToken}
                        onChange={(value) => setField('pageAccessToken', value)}
                        placeholder={t('instagramPageAccessTokenPlaceholder')}
                        type="password"
                        className="font-mono"
                    />
                    <Input
                        label={t('instagramAppSecretLabel')}
                        value={values.appSecret}
                        onChange={(value) => setField('appSecret', value)}
                        placeholder={t('instagramAppSecretPlaceholder')}
                        type="password"
                        className="font-mono"
                    />
                    <Input
                        label={t('instagramVerifyTokenLabel')}
                        value={values.verifyToken}
                        onChange={(value) => setField('verifyToken', value)}
                        placeholder={t('instagramVerifyTokenPlaceholder')}
                        className="font-mono"
                    />
                    {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        {t('actions.cancel')}
                    </Button>
                    <Button type="submit" disabled={hasMissingField || isConnecting}>
                        {isConnecting ? t('validating') : t('connectInstagram')}
                    </Button>
                </div>
            </form>
        </Modal>
    )
}
