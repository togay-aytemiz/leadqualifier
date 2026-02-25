'use client'

import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Modal, TextArea } from '@/design'
import {
    listConversationWhatsAppTemplates,
    sendConversationWhatsAppTemplateMessage,
    type InboxWhatsAppTemplateSummary
} from '@/lib/inbox/actions'
import { useTranslations } from 'next-intl'

interface WhatsAppTemplateSendModalProps {
    conversationId: string
    isOpen: boolean
    isReadOnly?: boolean
    onClose: () => void
    onSent?: () => void | Promise<void>
}

function toTemplateOptionValue(template: InboxWhatsAppTemplateSummary) {
    return `${template.name}::${template.language ?? ''}`
}

function compactMessageId(messageId: string) {
    if (messageId.length <= 32) return messageId
    return `${messageId.slice(0, 14)}...${messageId.slice(-10)}`
}

export function WhatsAppTemplateSendModal({
    conversationId,
    isOpen,
    isReadOnly = false,
    onClose,
    onSent
}: WhatsAppTemplateSendModalProps) {
    const t = useTranslations('inbox.whatsappTemplateModal')
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [templates, setTemplates] = useState<InboxWhatsAppTemplateSummary[]>([])
    const [selectedTemplateValue, setSelectedTemplateValue] = useState('')
    const [bodyParametersText, setBodyParametersText] = useState('')
    const [errorMessage, setErrorMessage] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [successMessageId, setSuccessMessageId] = useState('')

    const selectedTemplate = useMemo(
        () => templates.find(template => toTemplateOptionValue(template) === selectedTemplateValue) ?? null,
        [selectedTemplateValue, templates]
    )

    const loadTemplates = async () => {
        setIsLoadingTemplates(true)
        setErrorMessage('')
        setSuccessMessage('')
        setSuccessMessageId('')

        const result = await listConversationWhatsAppTemplates(conversationId)
        if (!result.ok) {
            setTemplates([])
            setSelectedTemplateValue('')
            if (result.reason === 'billing_locked') {
                setErrorMessage(t('errors.billingLocked'))
            } else if (result.reason === 'missing_channel') {
                setErrorMessage(t('errors.missingChannel'))
            } else {
                setErrorMessage(t('errors.loadFailed'))
            }
            setIsLoadingTemplates(false)
            return
        }

        setTemplates(result.templates)
        setSelectedTemplateValue((current) => {
            if (current && result.templates.some(template => toTemplateOptionValue(template) === current)) {
                return current
            }
            const firstTemplate = result.templates[0]
            return firstTemplate ? toTemplateOptionValue(firstTemplate) : ''
        })
        setIsLoadingTemplates(false)
    }

    useEffect(() => {
        if (!isOpen) return
        void loadTemplates()
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        setBodyParametersText('')
        setErrorMessage('')
        setSuccessMessage('')
        setSuccessMessageId('')
    }, [isOpen])

    const handleSend = async () => {
        if (isReadOnly) return

        setErrorMessage('')
        setSuccessMessage('')
        setSuccessMessageId('')

        if (!selectedTemplate || !selectedTemplate.language) {
            setErrorMessage(t('errors.validation'))
            return
        }

        setIsSending(true)
        const bodyParameters = bodyParametersText
            .split('\n')
            .map(value => value.trim())
            .filter(Boolean)

        const result = await sendConversationWhatsAppTemplateMessage({
            conversationId,
            templateName: selectedTemplate.name,
            languageCode: selectedTemplate.language,
            bodyParameters
        })

        if (!result.ok) {
            if (result.reason === 'billing_locked') {
                setErrorMessage(t('errors.billingLocked'))
            } else if (result.reason === 'missing_channel') {
                setErrorMessage(t('errors.missingChannel'))
            } else if (result.reason === 'validation') {
                setErrorMessage(t('errors.validation'))
            } else {
                setErrorMessage(t('errors.sendFailed'))
            }
            setIsSending(false)
            return
        }

        setSuccessMessage(t('success'))
        setSuccessMessageId(result.messageId ?? '')
        setIsSending(false)
        if (onSent) {
            await onSent()
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('title')}>
            <div className="space-y-4">
                <Alert variant="info">
                    {t('description')}
                </Alert>

                <div className="flex justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadTemplates()}
                        disabled={isLoadingTemplates}
                    >
                        {isLoadingTemplates ? t('loadingTemplates') : t('refreshTemplates')}
                    </Button>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase">
                        {t('templateLabel')}
                    </label>
                    <select
                        className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm bg-white text-gray-900"
                        value={selectedTemplateValue}
                        onChange={(event) => setSelectedTemplateValue(event.target.value)}
                        disabled={isLoadingTemplates || templates.length === 0}
                    >
                        {templates.map(template => (
                            <option key={toTemplateOptionValue(template)} value={toTemplateOptionValue(template)}>
                                {template.name} ({template.language ?? 'n/a'})
                            </option>
                        ))}
                    </select>
                </div>

                {selectedTemplate && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-600">
                        <div>
                            <span className="font-semibold text-gray-700">{t('languageLabel')}: </span>
                            <span>{selectedTemplate.language ?? 'n/a'}</span>
                        </div>
                        <div>
                            <span className="font-semibold text-gray-700">{t('statusLabel')}: </span>
                            <span>{selectedTemplate.status ?? 'n/a'}</span>
                        </div>
                        <div>
                            <span className="font-semibold text-gray-700">{t('categoryLabel')}: </span>
                            <span>{selectedTemplate.category ?? 'n/a'}</span>
                        </div>
                    </div>
                )}

                {templates.length === 0 && !isLoadingTemplates && !errorMessage && (
                    <Alert variant="warning">{t('noTemplates')}</Alert>
                )}

                <TextArea
                    label={t('bodyParamsLabel')}
                    value={bodyParametersText}
                    onChange={setBodyParametersText}
                    rows={4}
                    placeholder={t('bodyParamsHint')}
                />

                {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
                {successMessage && (
                    <Alert variant="success">
                        <p>{successMessage}</p>
                        {successMessageId && (
                            <p className="mt-1 text-xs text-green-800">
                                {t('messageIdLabel')}: <span className="font-mono" title={successMessageId}>{compactMessageId(successMessageId)}</span>
                            </p>
                        )}
                    </Alert>
                )}

                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={isReadOnly || templates.length === 0 || isSending}
                    >
                        {isSending ? t('sending') : t('send')}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
