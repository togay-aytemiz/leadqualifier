'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Input, Modal, TextArea } from '@/design'
import {
    listWhatsAppMessageTemplates,
    sendWhatsAppTemplateMessage,
    type WhatsAppTemplateSummary
} from '@/lib/channels/actions'
import { useTranslations } from 'next-intl'
import { WHATSAPP_OVERVIEW_URL } from '@/components/channels/whatsappOnboarding'

interface WhatsAppTemplateModalProps {
    channelId: string
    isOpen: boolean
    isReadOnly?: boolean
    onClose: () => void
}

function toTemplateOptionValue(template: WhatsAppTemplateSummary) {
    return `${template.name}::${template.language ?? ''}`
}

function compactMessageId(messageId: string) {
    if (messageId.length <= 32) return messageId
    return `${messageId.slice(0, 14)}...${messageId.slice(-10)}`
}

export function WhatsAppTemplateModal({
    channelId,
    isOpen,
    isReadOnly = false,
    onClose
}: WhatsAppTemplateModalProps) {
    const t = useTranslations('Channels')
    const [isGuideModalOpen, setIsGuideModalOpen] = useState(false)
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
    const [isSendingTemplate, setIsSendingTemplate] = useState(false)
    const [templates, setTemplates] = useState<WhatsAppTemplateSummary[]>([])
    const [selectedTemplateValue, setSelectedTemplateValue] = useState('')
    const [recipientPhone, setRecipientPhone] = useState('')
    const [bodyParametersText, setBodyParametersText] = useState('')
    const [loadError, setLoadError] = useState('')
    const [sendError, setSendError] = useState('')
    const [sendSuccess, setSendSuccess] = useState('')
    const [sendSuccessMessageId, setSendSuccessMessageId] = useState('')

    const selectedTemplate = useMemo(
        () => templates.find(template => toTemplateOptionValue(template) === selectedTemplateValue) ?? null,
        [selectedTemplateValue, templates]
    )

    const loadTemplates = useCallback(async () => {
        setIsLoadingTemplates(true)
        setLoadError('')
        setSendError('')
        setSendSuccess('')
        setSendSuccessMessageId('')

        const result = await listWhatsAppMessageTemplates(channelId)
        if (!result.success) {
            setTemplates([])
            setSelectedTemplateValue('')
            setLoadError(t('templateTools.loadFailed', { error: result.error }))
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
    }, [channelId, t])

    const handleClose = useCallback(() => {
        setIsGuideModalOpen(false)
        onClose()
    }, [onClose])

    useEffect(() => {
        if (!isOpen) return
        const timeoutId = window.setTimeout(() => {
            void loadTemplates()
        }, 0)
        return () => window.clearTimeout(timeoutId)
    }, [isOpen, loadTemplates])

    useEffect(() => {
        if (!isOpen) return
        const timeoutId = window.setTimeout(() => {
            setRecipientPhone('')
            setBodyParametersText('')
            setSendError('')
            setSendSuccess('')
            setSendSuccessMessageId('')
        }, 0)
        return () => window.clearTimeout(timeoutId)
    }, [isOpen])

    useEffect(() => {
        if (isOpen) return
        const timeoutId = window.setTimeout(() => {
            setIsGuideModalOpen(false)
        }, 0)
        return () => window.clearTimeout(timeoutId)
    }, [isOpen])

    const handleSendTemplate = async () => {
        if (isReadOnly) return

        setSendError('')
        setSendSuccess('')
        setSendSuccessMessageId('')

        if (!recipientPhone.trim()) {
            setSendError(t('templateTools.validationRecipient'))
            return
        }

        if (!selectedTemplate || !selectedTemplate.language) {
            setSendError(t('templateTools.validationTemplate'))
            return
        }

        setIsSendingTemplate(true)

        const bodyParameters = bodyParametersText
            .split('\n')
            .map(value => value.trim())
            .filter(Boolean)

        const result = await sendWhatsAppTemplateMessage({
            channelId,
            to: recipientPhone.trim(),
            templateName: selectedTemplate.name,
            languageCode: selectedTemplate.language,
            bodyParameters
        })

        if (!result.success) {
            setSendError(t('templateTools.sendFailed', { error: result.error }))
            setIsSendingTemplate(false)
            return
        }

        setSendSuccess(t('templateTools.sendSuccess'))
        setSendSuccessMessageId(result.messageId ?? '')
        setIsSendingTemplate(false)
        handleClose()
    }

    return (
        <>
            <Modal isOpen={isOpen} onClose={handleClose} title={t('templateTools.title')}>
                <div className="space-y-4">
                    <Alert variant="info">
                        {t('templateTools.description')}
                    </Alert>

                    <Alert variant="warning">
                        <p className="font-medium">{t('templateTools.requirementTitle')}</p>
                        <p className="mt-1 text-sm leading-6">
                            {t('templateTools.requirementBody')}{' '}
                            <a
                                href={WHATSAPP_OVERVIEW_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-amber-800 underline underline-offset-2"
                            >
                                {t('templateTools.requirementLinkLabel')}
                            </a>
                        </p>
                    </Alert>

                    <div className="flex items-center justify-between gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setIsGuideModalOpen(true)}
                        >
                            {t('templateTools.openGuide')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void loadTemplates()}
                            disabled={isLoadingTemplates}
                        >
                            {isLoadingTemplates ? t('templateTools.loadingTemplates') : t('templateTools.refreshTemplates')}
                        </Button>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase">
                            {t('templateTools.templateLabel')}
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
                                <span className="font-semibold text-gray-700">{t('templateTools.languageLabel')}: </span>
                                <span>{selectedTemplate.language ?? 'n/a'}</span>
                            </div>
                            <div>
                                <span className="font-semibold text-gray-700">{t('templateTools.statusLabel')}: </span>
                                <span>{selectedTemplate.status ?? 'n/a'}</span>
                            </div>
                            <div>
                                <span className="font-semibold text-gray-700">{t('templateTools.categoryLabel')}: </span>
                                <span>{selectedTemplate.category ?? 'n/a'}</span>
                            </div>
                        </div>
                    )}

                    {templates.length === 0 && !isLoadingTemplates && !loadError && (
                        <Alert variant="warning">{t('templateTools.noTemplates')}</Alert>
                    )}

                    <Input
                        label={t('templateTools.recipientLabel')}
                        value={recipientPhone}
                        onChange={setRecipientPhone}
                        placeholder={t('templateTools.recipientPlaceholder')}
                    />

                    <TextArea
                        label={t('templateTools.bodyParamsLabel')}
                        value={bodyParametersText}
                        onChange={setBodyParametersText}
                        rows={4}
                        placeholder={t('templateTools.bodyParamsHint')}
                    />

                    {loadError && <Alert variant="error">{loadError}</Alert>}
                    {sendError && <Alert variant="error">{sendError}</Alert>}
                    {sendSuccess && (
                        <Alert variant="success">
                            <p>{sendSuccess}</p>
                            {sendSuccessMessageId && (
                                <p className="mt-1 text-xs text-green-800">
                                    {t('templateTools.messageIdLabel')}: <span className="font-mono" title={sendSuccessMessageId}>{compactMessageId(sendSuccessMessageId)}</span>
                                </p>
                            )}
                        </Alert>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={handleClose}>
                            {t('actions.cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleSendTemplate()}
                            disabled={isReadOnly || templates.length === 0 || isSendingTemplate}
                        >
                            {isSendingTemplate ? t('templateTools.sending') : t('templateTools.send')}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isGuideModalOpen}
                onClose={() => setIsGuideModalOpen(false)}
                title={t('templateTools.guideTitle')}
            >
                <div>
                    <p className="text-sm text-gray-700">{t('templateTools.guideDescription')}</p>
                    <Alert variant="warning" className="mt-4">
                        <p className="font-medium">{t('templateTools.requirementTitle')}</p>
                        <p className="mt-1 text-sm leading-6">
                            {t('templateTools.requirementBody')}{' '}
                            <a
                                href={WHATSAPP_OVERVIEW_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-amber-800 underline underline-offset-2"
                            >
                                {t('templateTools.requirementLinkLabel')}
                            </a>
                        </p>
                    </Alert>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
                        <li>{t('templateTools.guideStep1')}</li>
                        <li>{t('templateTools.guideStep2')}</li>
                        <li>{t('templateTools.guideStep3')}</li>
                        <li>{t('templateTools.guideStep4')}</li>
                        <li>{t('templateTools.guideStep5')}</li>
                    </ol>
                    <Alert variant="info" className="mt-4">
                        {t('templateTools.guideFooter')}
                    </Alert>
                    <div className="mt-4 flex justify-end">
                        <Button type="button" variant="secondary" onClick={() => setIsGuideModalOpen(false)}>
                            {t('templateTools.guideClose')}
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    )
}
