'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Input, Modal, TextArea } from '@/design'
import {
    createConversationPredefinedTemplate,
    deleteConversationPredefinedTemplate,
    listConversationPredefinedTemplates,
    listConversationWhatsAppTemplates,
    updateConversationPredefinedTemplate,
    type InboxPredefinedTemplateSummary,
    type InboxWhatsAppTemplateSummary
} from '@/lib/inbox/actions'
import type { ConversationPlatform } from '@/types/database'
import {
    resolveTemplatePickerActiveTab,
    resolveTemplatePickerInsertDisabled,
    resolveTemplatePickerRefreshLoading,
    resolveTemplatePickerTabs,
    type TemplatePickerTab
} from '@/components/inbox/template-picker-state'
import { ChevronDown, PencilLine, Plus, RotateCw, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface TemplatePickerModalProps {
    conversationId: string
    platform: ConversationPlatform
    isOpen: boolean
    isReadOnly?: boolean
    onClose: () => void
    onInsert: (value: string) => void
}

function toTemplateOptionValue(template: InboxWhatsAppTemplateSummary) {
    return `${template.name}::${template.language ?? ''}`
}

function parseBodyParameters(text: string) {
    return text
        .split('\n')
        .map(value => value.trim())
        .filter(Boolean)
}

export function TemplatePickerModal({
    conversationId,
    platform,
    isOpen,
    isReadOnly = false,
    onClose,
    onInsert
}: TemplatePickerModalProps) {
    const t = useTranslations('inbox.templatePickerModal')

    const tabs = useMemo(() => resolveTemplatePickerTabs(platform), [platform])
    const [activeTab, setActiveTab] = useState<TemplatePickerTab>(resolveTemplatePickerActiveTab(platform, null))

    const [isLoadingPredefinedTemplates, setIsLoadingPredefinedTemplates] = useState(false)
    const [isLoadingWhatsAppTemplates, setIsLoadingWhatsAppTemplates] = useState(false)
    const [isSavingPredefinedTemplate, setIsSavingPredefinedTemplate] = useState(false)
    const [isDeletingPredefinedTemplate, setIsDeletingPredefinedTemplate] = useState(false)

    const [predefinedTemplates, setPredefinedTemplates] = useState<InboxPredefinedTemplateSummary[]>([])
    const [selectedPredefinedTemplateId, setSelectedPredefinedTemplateId] = useState('')

    const [whatsAppTemplates, setWhatsAppTemplates] = useState<InboxWhatsAppTemplateSummary[]>([])
    const [selectedWhatsAppTemplateValue, setSelectedWhatsAppTemplateValue] = useState('')
    const [whatsAppBodyParametersText, setWhatsAppBodyParametersText] = useState('')

    const [isEditorOpen, setIsEditorOpen] = useState(false)
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
    const [templateTitleDraft, setTemplateTitleDraft] = useState('')
    const [templateContentDraft, setTemplateContentDraft] = useState('')

    const [errorMessage, setErrorMessage] = useState('')
    const tabContentRef = useRef<HTMLDivElement | null>(null)
    const [tabContentHeight, setTabContentHeight] = useState<number | null>(null)

    const selectedPredefinedTemplate = useMemo(
        () => predefinedTemplates.find(item => item.id === selectedPredefinedTemplateId) ?? null,
        [predefinedTemplates, selectedPredefinedTemplateId]
    )

    const selectedWhatsAppTemplate = useMemo(
        () => whatsAppTemplates.find(template => toTemplateOptionValue(template) === selectedWhatsAppTemplateValue) ?? null,
        [selectedWhatsAppTemplateValue, whatsAppTemplates]
    )

    const loadPredefinedTemplates = async () => {
        setIsLoadingPredefinedTemplates(true)
        setErrorMessage('')

        const result = await listConversationPredefinedTemplates(conversationId)
        if (!result.ok) {
            if (result.reason === 'billing_locked') {
                setErrorMessage(t('errors.billingLocked'))
            } else {
                setErrorMessage(t('errors.loadPredefinedFailed'))
            }
            setPredefinedTemplates([])
            setSelectedPredefinedTemplateId('')
            setIsLoadingPredefinedTemplates(false)
            return
        }

        setPredefinedTemplates(result.templates)
        setSelectedPredefinedTemplateId((current) => {
            if (current && result.templates.some(template => template.id === current)) {
                return current
            }
            return result.templates[0]?.id ?? ''
        })
        setIsLoadingPredefinedTemplates(false)
    }

    const loadWhatsAppTemplates = async () => {
        if (platform !== 'whatsapp') return

        setIsLoadingWhatsAppTemplates(true)
        setErrorMessage('')

        const result = await listConversationWhatsAppTemplates(conversationId)
        if (!result.ok) {
            if (result.reason === 'billing_locked') {
                setErrorMessage(t('errors.billingLocked'))
            } else if (result.reason === 'missing_channel') {
                setErrorMessage(t('errors.missingChannel'))
            } else {
                setErrorMessage(t('errors.loadWhatsAppFailed'))
            }
            setWhatsAppTemplates([])
            setSelectedWhatsAppTemplateValue('')
            setIsLoadingWhatsAppTemplates(false)
            return
        }

        setWhatsAppTemplates(result.templates)
        setSelectedWhatsAppTemplateValue((current) => {
            if (current && result.templates.some(template => toTemplateOptionValue(template) === current)) {
                return current
            }
            const firstTemplate = result.templates[0]
            return firstTemplate ? toTemplateOptionValue(firstTemplate) : ''
        })
        setIsLoadingWhatsAppTemplates(false)
    }

    const resetEditor = () => {
        setEditingTemplateId(null)
        setTemplateTitleDraft('')
        setTemplateContentDraft('')
        setIsEditorOpen(false)
    }

    useEffect(() => {
        if (!isOpen) return

        setActiveTab(resolveTemplatePickerActiveTab(platform, null))
        setWhatsAppBodyParametersText('')
        setErrorMessage('')
        resetEditor()

        void loadPredefinedTemplates()
        if (platform === 'whatsapp') {
            void loadWhatsAppTemplates()
        }
    }, [isOpen, platform, conversationId])

    useLayoutEffect(() => {
        if (!isOpen) return
        const element = tabContentRef.current
        if (!element) return

        const measureHeight = () => {
            const nextHeight = element.getBoundingClientRect().height
            setTabContentHeight((current) => {
                if (current === null) return nextHeight
                return Math.abs(current - nextHeight) < 1 ? current : nextHeight
            })
        }

        measureHeight()

        let observer: ResizeObserver | null = null
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => {
                measureHeight()
            })
            observer.observe(element)
        }

        const onWindowResize = () => {
            measureHeight()
        }
        window.addEventListener('resize', onWindowResize)

        return () => {
            observer?.disconnect()
            window.removeEventListener('resize', onWindowResize)
        }
    }, [isOpen, activeTab])

    useEffect(() => {
        if (!isOpen) {
            setTabContentHeight(null)
        }
    }, [isOpen])

    const openCreateEditor = () => {
        setIsEditorOpen(true)
        setEditingTemplateId(null)
        setTemplateTitleDraft('')
        setTemplateContentDraft('')
        setErrorMessage('')
    }

    const openEditEditor = () => {
        if (!selectedPredefinedTemplate) {
            setErrorMessage(t('errors.validationPredefinedSelection'))
            return
        }

        setIsEditorOpen(true)
        setEditingTemplateId(selectedPredefinedTemplate.id)
        setTemplateTitleDraft(selectedPredefinedTemplate.title)
        setTemplateContentDraft(selectedPredefinedTemplate.content)
        setErrorMessage('')
    }

    const handleSavePredefinedTemplate = async () => {
        if (isReadOnly) return

        setErrorMessage('')

        const title = templateTitleDraft.trim()
        const content = templateContentDraft.trim()

        if (!title || !content) {
            setErrorMessage(t('errors.validationPredefinedDraft'))
            return
        }

        setIsSavingPredefinedTemplate(true)

        if (!editingTemplateId) {
            const result = await createConversationPredefinedTemplate({
                conversationId,
                title,
                content
            })

            if (!result.ok) {
                setErrorMessage(result.reason === 'billing_locked' ? t('errors.billingLocked') : t('errors.savePredefinedFailed'))
                setIsSavingPredefinedTemplate(false)
                return
            }

            setPredefinedTemplates((prev) => [result.template, ...prev])
            setSelectedPredefinedTemplateId(result.template.id)
            setIsSavingPredefinedTemplate(false)
            resetEditor()
            return
        }

        const result = await updateConversationPredefinedTemplate({
            conversationId,
            templateId: editingTemplateId,
            title,
            content
        })

        if (!result.ok) {
            setErrorMessage(result.reason === 'billing_locked' ? t('errors.billingLocked') : t('errors.savePredefinedFailed'))
            setIsSavingPredefinedTemplate(false)
            return
        }

        setPredefinedTemplates((prev) => prev.map((item) => (
            item.id === result.template.id ? result.template : item
        )))
        setSelectedPredefinedTemplateId(result.template.id)
        setIsSavingPredefinedTemplate(false)
        resetEditor()
    }

    const handleDeletePredefinedTemplate = async () => {
        if (isReadOnly) return
        if (!selectedPredefinedTemplate) {
            setErrorMessage(t('errors.validationPredefinedSelection'))
            return
        }

        setErrorMessage('')
        setIsDeletingPredefinedTemplate(true)

        const result = await deleteConversationPredefinedTemplate({
            conversationId,
            templateId: selectedPredefinedTemplate.id
        })

        if (!result.ok) {
            setErrorMessage(result.reason === 'billing_locked' ? t('errors.billingLocked') : t('errors.deletePredefinedFailed'))
            setIsDeletingPredefinedTemplate(false)
            return
        }

        const nextTemplates = predefinedTemplates.filter(item => item.id !== selectedPredefinedTemplate.id)
        setPredefinedTemplates(nextTemplates)
        setSelectedPredefinedTemplateId((current) => {
            if (current !== selectedPredefinedTemplate.id) return current
            return nextTemplates[0]?.id ?? ''
        })
        setIsDeletingPredefinedTemplate(false)
    }

    const handleRefresh = () => {
        if (activeTab === 'predefined') {
            void loadPredefinedTemplates()
            return
        }

        void loadWhatsAppTemplates()
    }

    const handleInsert = () => {
        setErrorMessage('')

        if (activeTab === 'predefined') {
            if (!selectedPredefinedTemplate) {
                setErrorMessage(t('errors.validationPredefinedSelection'))
                return
            }

            onInsert(selectedPredefinedTemplate.content)
            onClose()
            return
        }

        if (!selectedWhatsAppTemplate) {
            setErrorMessage(t('errors.validationWhatsAppSelection'))
            return
        }

        const bodyParameters = parseBodyParameters(whatsAppBodyParametersText)
        const templateLabel = selectedWhatsAppTemplate.language
            ? `${selectedWhatsAppTemplate.name} (${selectedWhatsAppTemplate.language})`
            : selectedWhatsAppTemplate.name

        const templateInsertText = bodyParameters.length > 0
            ? `${t('whatsAppInsertPrefix', { template: templateLabel })}\n${bodyParameters.join('\n')}`
            : t('whatsAppInsertPrefix', { template: templateLabel })

        onInsert(templateInsertText)
        onClose()
    }

    const isInsertDisabled = resolveTemplatePickerInsertDisabled({
        activeTab,
        hasSelectedPredefinedTemplate: Boolean(selectedPredefinedTemplate),
        hasSelectedWhatsAppTemplate: Boolean(selectedWhatsAppTemplate),
        isReadOnly
    })

    const isRefreshLoading = resolveTemplatePickerRefreshLoading({
        activeTab,
        isLoadingPredefinedTemplates,
        isLoadingWhatsAppTemplates
    })

    const headerActions = platform === 'whatsapp' && activeTab === 'whatsapp' ? (
        <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshLoading}
            className="text-gray-500 hover:text-gray-700 p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('refresh')}
            aria-label={t('refresh')}
        >
            <RotateCw size={16} className={isRefreshLoading ? 'animate-spin' : ''} />
        </button>
    ) : undefined

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('title')}
            headerActions={headerActions}
        >
            <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1 -mr-1">
                {tabs.length > 1 && (
                    <div className="border-b border-gray-200">
                        <div className="flex items-end gap-4">
                            {tabs.map((tab) => {
                                const isActive = activeTab === tab
                                return (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setActiveTab(tab)}
                                        className={`-mb-px flex-1 sm:flex-none border-b-2 px-1 pb-2.5 pt-1 text-center sm:text-left text-sm font-semibold transition-colors ${isActive ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                    >
                                        {tab === 'predefined' ? t('tabs.predefined') : t('tabs.whatsapp')}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                <div
                    className="overflow-hidden transition-[height] duration-300 ease-out"
                    style={tabContentHeight === null ? undefined : { height: `${tabContentHeight}px` }}
                >
                    <div ref={tabContentRef} className="space-y-3 pb-1">
                        {activeTab === 'predefined' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase">
                                        {t('predefined.templateLabel')}
                                    </label>
                                    <div className="relative">
                                        <select
                                            className="w-full h-11 pl-3 pr-10 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm bg-white text-gray-900 appearance-none"
                                            value={selectedPredefinedTemplateId}
                                            onChange={(event) => setSelectedPredefinedTemplateId(event.target.value)}
                                            disabled={isLoadingPredefinedTemplates || predefinedTemplates.length === 0}
                                        >
                                            {predefinedTemplates.map(template => (
                                                <option key={template.id} value={template.id}>
                                                    {template.title}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown
                                            size={18}
                                            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${isLoadingPredefinedTemplates || predefinedTemplates.length === 0 ? 'text-gray-300' : 'text-gray-500'}`}
                                        />
                                    </div>
                                </div>

                                {predefinedTemplates.length === 0 && !isLoadingPredefinedTemplates && (
                                    <Alert variant="warning">{t('predefined.emptyState')}</Alert>
                                )}

                                {selectedPredefinedTemplate && (
                                    <TextArea
                                        label={t('predefined.previewLabel')}
                                        value={selectedPredefinedTemplate.content}
                                        onChange={(value) => {
                                            setPredefinedTemplates((prev) => prev.map((item) => (
                                                item.id === selectedPredefinedTemplate.id ? { ...item, content: value } : item
                                            )))
                                        }}
                                        rows={4}
                                        readOnly
                                    />
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={openCreateEditor} disabled={isReadOnly}>
                                        <Plus size={14} className="mr-1" />
                                        {t('predefined.new')}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={openEditEditor}
                                        disabled={isReadOnly || !selectedPredefinedTemplate}
                                    >
                                        <PencilLine size={14} className="mr-1" />
                                        {t('predefined.edit')}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="danger"
                                        size="sm"
                                        onClick={() => void handleDeletePredefinedTemplate()}
                                        disabled={isReadOnly || !selectedPredefinedTemplate || isDeletingPredefinedTemplate}
                                    >
                                        <Trash2 size={14} className="mr-1" />
                                        {t('predefined.delete')}
                                    </Button>
                                </div>

                                {isEditorOpen && (
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                                        <Input
                                            label={t('predefined.editorTitleLabel')}
                                            value={templateTitleDraft}
                                            onChange={setTemplateTitleDraft}
                                            maxLength={80}
                                        />
                                        <TextArea
                                            label={t('predefined.editorContentLabel')}
                                            value={templateContentDraft}
                                            onChange={setTemplateContentDraft}
                                            rows={4}
                                            maxLength={2000}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <Button type="button" variant="secondary" size="sm" onClick={resetEditor}>
                                                {t('cancel')}
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => void handleSavePredefinedTemplate()}
                                                disabled={isReadOnly || isSavingPredefinedTemplate}
                                            >
                                                {isSavingPredefinedTemplate ? t('predefined.saving') : t('predefined.save')}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'whatsapp' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase">
                                        {t('whatsapp.templateLabel')}
                                    </label>
                                    <div className="relative">
                                        <select
                                            className="w-full h-11 pl-3 pr-10 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm bg-white text-gray-900 appearance-none"
                                            value={selectedWhatsAppTemplateValue}
                                            onChange={(event) => setSelectedWhatsAppTemplateValue(event.target.value)}
                                            disabled={isLoadingWhatsAppTemplates || whatsAppTemplates.length === 0}
                                        >
                                            {whatsAppTemplates.map(template => (
                                                <option key={toTemplateOptionValue(template)} value={toTemplateOptionValue(template)}>
                                                    {template.name} ({template.language ?? 'n/a'})
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown
                                            size={18}
                                            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${isLoadingWhatsAppTemplates || whatsAppTemplates.length === 0 ? 'text-gray-300' : 'text-gray-500'}`}
                                        />
                                    </div>
                                </div>

                                {selectedWhatsAppTemplate && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-gray-600">
                                        <div>
                                            <span className="font-semibold text-gray-700">{t('whatsapp.languageLabel')}: </span>
                                            <span>{selectedWhatsAppTemplate.language ?? 'n/a'}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-700">{t('whatsapp.statusLabel')}: </span>
                                            <span>{selectedWhatsAppTemplate.status ?? 'n/a'}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-gray-700">{t('whatsapp.categoryLabel')}: </span>
                                            <span>{selectedWhatsAppTemplate.category ?? 'n/a'}</span>
                                        </div>
                                    </div>
                                )}

                                {whatsAppTemplates.length === 0 && !isLoadingWhatsAppTemplates && (
                                    <Alert variant="warning">{t('whatsapp.emptyState')}</Alert>
                                )}

                                <TextArea
                                    label={t('whatsapp.paramsLabel')}
                                    value={whatsAppBodyParametersText}
                                    onChange={setWhatsAppBodyParametersText}
                                    rows={4}
                                    placeholder={t('whatsapp.paramsPlaceholder')}
                                />
                            </div>
                        )}

                        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
                    </div>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
                        {t('cancel')}
                    </Button>
                    <Button
                        type="button"
                        onClick={handleInsert}
                        disabled={isInsertDisabled}
                        className="w-full sm:w-auto"
                    >
                        {t('insert')}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
