'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Skill } from '@/types/database'
import { ClientSearchInput } from '@/components/common/ClientSearchInput'
import { Badge, ConfirmDialog } from '@/design/primitives'
import { createSkill, updateSkill, deleteSkill, toggleSkill } from '@/lib/skills/actions'
import { Plus, Trash2 } from 'lucide-react'
import { HiOutlineSparkles } from 'react-icons/hi2'

import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'

interface SkillsContainerProps {
    initialSkills: Skill[]
    organizationId: string
    handoverMessage: string
    isReadOnly?: boolean
}

export function SkillsContainer({ initialSkills, organizationId, handoverMessage, isReadOnly = false }: SkillsContainerProps) {
    const t = useTranslations('skills')
    const tc = useTranslations('common')
    const locale = useLocale()
    const router = useRouter()
    const [skills, setSkills] = useState<Skill[]>(initialSkills)
    const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [validationError, setValidationError] = useState<string | null>(null)

    // Form state
    const [formData, setFormData] = useState({
        title: '',
        response_text: '',
        triggers: [''], // Start with one empty trigger
        requires_human_handover: false
    })

    // To track dirty state
    const [initialFormState, setInitialFormState] = useState({
        title: '',
        response_text: '',
        triggers: [''],
        requires_human_handover: false
    })

    // Sync skills when initialSkills changes (e.g. after search)
    useEffect(() => {
        setSkills(initialSkills)
    }, [initialSkills])

    // Update form when selection changes
    useEffect(() => {
        if (selectedSkillId) {
            const skill = skills.find(s => s.id === selectedSkillId)
            if (skill) {
                const initialData = {
                    title: skill.title,
                    response_text: skill.response_text,
                    // Ensure at least 3 triggers for editing consistency if backend data is sparse
                    triggers: ensureMinTriggers(skill.trigger_examples, 3),
                    requires_human_handover: skill.requires_human_handover ?? false
                }
                setFormData(initialData)
                setInitialFormState(initialData)
                setIsCreating(false)
                setShowDeleteConfirm(false)
            }
        } else if (isCreating) {
            const initialData = {
                title: '',
                response_text: '',
                triggers: ['', '', ''], // 3 empty triggers for new skill
                requires_human_handover: false
            }
            setFormData(initialData)
            setInitialFormState(initialData)
            setShowDeleteConfirm(false)
        }
    }, [selectedSkillId, isCreating, skills])

    const ensureMinTriggers = (triggers: string[], min: number) => {
        const newTriggers = [...triggers]
        while (newTriggers.length < min) {
            newTriggers.push('')
        }
        return newTriggers
    }

    const isDirty = useMemo(() => {
        return JSON.stringify(formData) !== JSON.stringify(initialFormState)
    }, [formData, initialFormState])

    const handleCreateNew = () => {
        if (isReadOnly) return
        setSelectedSkillId(null)
        setIsCreating(true)
    }

    const handleSelectSkill = (id: string) => {
        // If clicking same skill, do nothing
        if (selectedSkillId === id) return

        // If dirty, maybe warn? For now assume direct switch is okay, losing changes
        // User asked for specific "Save" behavior, so switching discards changes naturally in this pattern
        setSelectedSkillId(id)
        setIsCreating(false)
    }

    const handleArchiveToggle = async () => {
        if (isReadOnly) return
        if (!selectedSkillId) return
        const skill = skills.find(s => s.id === selectedSkillId)
        if (!skill) return

        // Use the same logic as the list toggle
        try {
            await toggleSkill(skill.id, !skill.enabled)
            router.refresh()
            setSkills(prev => prev.map(s =>
                s.id === skill.id ? { ...s, enabled: !s.enabled } : s
            ))
        } catch (error) {
            console.error('Failed to toggle skill', error)
        }
    }

    const handleTriggerChange = (index: number, value: string) => {
        const newTriggers = [...formData.triggers]
        newTriggers[index] = value
        setFormData(prev => ({ ...prev, triggers: newTriggers }))
    }

    const handleAddTrigger = () => {
        if (isReadOnly) return
        if (formData.triggers.length >= 10) return
        setFormData(prev => ({ ...prev, triggers: [...prev.triggers, ''] }))
    }

    const handleRemoveTrigger = (index: number) => {
        if (isReadOnly) return
        // Prevent removing if it's one of the first 3
        if (index < 3) return

        const newTriggers = [...formData.triggers]
        newTriggers.splice(index, 1)
        setFormData(prev => ({ ...prev, triggers: newTriggers }))
    }

    const handleSave = async () => {
        if (isReadOnly) return
        setValidationError(null)
        // Validate
        if (!formData.title.trim()) {
            setValidationError(t('validation.required', { field: t('nameLabel') }))
            return
        }

        // Check mandatory triggers (first 3) - strict check or loose? 
        // Plan said first 3 mandatory. Let's assume non-empty.
        const firstThree = formData.triggers.slice(0, 3)
        if (firstThree.some(t => !t.trim())) {
            setValidationError(t('validation.triggersRequired'))
            return
        }

        if (!formData.response_text.trim()) {
            setValidationError(t('validation.required', { field: t('responseLabel') }))
            return
        }

        setIsSaving(true)
        try {
            const cleanTriggers = formData.triggers.map(t => t.trim()).filter(Boolean)

            if (isCreating) {
                const newSkill = await createSkill({
                    organization_id: organizationId,
                    title: formData.title,
                    response_text: formData.response_text,
                    trigger_examples: cleanTriggers,
                    enabled: true,
                    requires_human_handover: formData.requires_human_handover
                })

                // Refresh and select the new skill
                router.refresh()
                setIsCreating(false)

                // Manually update local state to avoid flicker before refresh lands
                const newSkillObj: Skill = {
                    ...newSkill,
                    // Fill default if needed, though createSkill returns full object
                }
                setSkills(prev => [newSkillObj, ...prev])
                setSelectedSkillId(newSkill.id)

            } else if (selectedSkillId) {
                await updateSkill(selectedSkillId, {
                    title: formData.title,
                    response_text: formData.response_text,
                    trigger_examples: cleanTriggers,
                    requires_human_handover: formData.requires_human_handover
                })
                router.refresh()

                // Update local state and re-init dirty check
                setSkills(prev => prev.map(s =>
                    s.id === selectedSkillId ? {
                        ...s,
                        title: formData.title,
                        response_text: formData.response_text,
                        trigger_examples: cleanTriggers,
                        requires_human_handover: formData.requires_human_handover
                    } : s
                ))
                setInitialFormState(formData)
            }
        } catch (error) {
            console.error('Failed to save skill', error)
            setValidationError(t('validation.saveFailed'))
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        if (isReadOnly) return
        if (!selectedSkillId) return

        setIsSaving(true)
        try {
            await deleteSkill(selectedSkillId)
            setSelectedSkillId(null)
            setShowDeleteConfirm(false)
            router.refresh()
            setSkills(prev => prev.filter(s => s.id !== selectedSkillId))
        } catch (error) {
            console.error('Failed to delete skill', error)
        } finally {
            setIsSaving(false)
        }
    }

    const selectedSkill = skills.find(s => s.id === selectedSkillId)
    const showForm = isCreating || selectedSkill

    const aiSettingsDeepLink = locale === 'tr'
        ? '/settings/ai?focus=human-escalation&field=handover-message#human-escalation'
        : `/${locale}/settings/ai?focus=human-escalation&field=handover-message#human-escalation`

    return (
        <div className="flex h-full bg-white border-t border-gray-200">
            {/* Left Panel - List (33%) */}
            <div className="w-1/3 flex flex-col border-r border-gray-200 bg-white">
                <div className="h-14 border-b border-gray-200 px-6 flex items-center justify-between shrink-0 bg-white">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-gray-900">{t('title')}</h2>
                        <span className="text-gray-500 font-medium text-sm bg-gray-100 px-2 py-0.5 rounded-full">
                            {skills.length}
                        </span>
                    </div>
                    <button
                        onClick={handleCreateNew}
                        disabled={isReadOnly}
                        className="h-10 bg-[#242A40] hover:bg-[#1B2033] text-white px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm shrink-0"
                    >
                        <Plus size={18} />
                        {t('create')}
                    </button>
                </div>

                <div className="px-6 py-3 border-b border-gray-100 bg-white shrink-0">
                    {isReadOnly && (
                        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                            {t('readOnlyMode')}
                        </p>
                    )}
                    <ClientSearchInput placeholder={t('searchPlaceholder')} />
                </div>

                <div className="flex-1 overflow-y-auto">
                    {skills.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            {t('noSkills')}
                        </div>
                    ) : (
                        <div>
                            {skills.map(skill => (
                                <div
                                    key={skill.id}
                                    onClick={() => handleSelectSkill(skill.id)}
                                    className={`px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors relative group bg-white ${selectedSkillId === skill.id ? "bg-blue-50/40" : ""
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={`text-base font-medium ${selectedSkillId === skill.id ? "text-blue-700" : "text-gray-900"}`}>
                                            {skill.title}
                                        </span>
                                        <Badge variant={skill.enabled ? 'success' : 'neutral'}>
                                            {skill.enabled ? tc('enabled') : tc('disabled')}
                                        </Badge>
                                    </div>
                                    {selectedSkillId === skill.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel - Detail/Form (66%) */}
            <div className="flex-1 flex flex-col bg-white overflow-hidden relative border-l border-gray-200 -ml-px">
                {showForm ? (
                    <div className="flex flex-col h-full bg-white">
                        {/* Header */}
                        <div className="h-14 border-b border-gray-200 px-8 flex items-center justify-between shrink-0 bg-white">
                            <h3 className="font-bold text-gray-900 text-xl">
                                {isCreating ? t('newSkill') : t('editSkill')}
                            </h3>
                            <div className="flex gap-3">
                                {!isCreating && (
                                    <>
                                        <button
                                            onClick={handleArchiveToggle}
                                            disabled={isReadOnly}
                                            className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                                        >
                                            {selectedSkill?.enabled ? t('archive') : t('activate')}
                                        </button>
                                        <button
                                            onClick={() => setShowDeleteConfirm(true)}
                                            disabled={isReadOnly}
                                            className="px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
                                        >
                                            {t('delete')}
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={handleSave}
                                    disabled={isReadOnly || !isDirty || isSaving}
                                    className="px-4 py-2 bg-[#242A40] text-white rounded-lg text-sm font-medium hover:bg-[#1B2033] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors flex items-center gap-2"
                                >
                                    {t('saveChanges')}
                                </button>
                            </div>
                        </div>

                        {/* Form Content */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8">
                            {validationError && (
                                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-200">
                                    {validationError}
                                </div>
                            )}
                            {/* Skill Name */}
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-gray-500 tracking-wider">
                                    {t('nameLabel')}
                                </label>
                                <input
                                    value={formData.title}
                                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder={t('namePlaceholder')}
                                    disabled={isReadOnly}
                                    className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                />
                            </div>

                            {/* Triggers */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-semibold text-gray-500 tracking-wider">
                                        {t('triggersLabel')} {formData.triggers.length}/10
                                    </label>
                                    <span className="text-xs text-gray-400">{t('triggersHint')}</span>
                                </div>
                                <div className="space-y-2">
                                    {formData.triggers.map((trigger, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <input
                                                value={trigger}
                                                onChange={(e) => handleTriggerChange(idx, e.target.value)}
                                                placeholder={idx < 3 ? t('triggerPlaceholderMandatory') : t('triggerPlaceholderOptional')}
                                                disabled={isReadOnly}
                                                className={`flex-1 h-[42px] px-4 bg-white text-gray-900 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm ${idx < 3 && !trigger && isDirty ? 'border-red-300 bg-red-50/10' : 'border-gray-300'
                                                    }`}
                                            />
                                            {idx >= 3 && (
                                                <button
                                                    onClick={() => handleRemoveTrigger(idx)}
                                                    disabled={isReadOnly}
                                                    className="h-[42px] w-[42px] flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title={t('removeTrigger')}
                                                >
                                                    <Trash2 size={20} className="font-light" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {formData.triggers.length < 10 && (
                                    <button
                                        onClick={handleAddTrigger}
                                        className="text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1 mt-2"
                                    >
                                        <Plus size={16} />
                                        {t('addTrigger')}
                                    </button>
                                )}
                            </div>

                            {/* Response Text */}
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-gray-500 tracking-wider">
                                    {t('responseLabel')}
                                </label>
                                <textarea
                                    value={formData.response_text}
                                    onChange={(e) => setFormData(prev => ({ ...prev, response_text: e.target.value }))}
                                    placeholder={t('responsePlaceholder')}
                                    disabled={isReadOnly}
                                    className="w-full px-4 py-3 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-base min-h-[150px] resize-none leading-relaxed"
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={formData.requires_human_handover}
                                        disabled={isReadOnly}
                                        onChange={(event) => setFormData(prev => ({
                                            ...prev,
                                            requires_human_handover: event.target.checked
                                        }))}
                                    />
                                    {t('requiresHumanHandover')}
                                </label>

                                {formData.requires_human_handover && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                                        <p className="text-xs font-semibold text-amber-800 tracking-wider">
                                            {t('customerNoticeReadonlyLabel')}
                                        </p>
                                        <p className="text-sm text-amber-900">
                                            {handoverMessage}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => router.push(aiSettingsDeepLink)}
                                            disabled={isReadOnly}
                                            className="text-sm font-medium text-amber-800 hover:text-amber-900 underline underline-offset-2"
                                        >
                                            {t('editHandoverMessageInAiSettings')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Delete Confirmation: Replaced by global ConfirmDialog below */}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50/50">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <HiOutlineSparkles className="text-gray-400" size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{t('noSelection')}</h3>
                        <p className="text-gray-500 text-sm max-w-xs mb-6">
                            {t('noSelectionDesc')}
                        </p>
                        <button
                            onClick={handleCreateNew}
                            className="bg-[#242A40] hover:bg-[#1B2033] text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2.5 transition-colors shadow-sm"
                        >
                            <Plus size={20} />
                            {t('createButton')}
                        </button>
                    </div>
                )}
            </div>

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                title={t('deleteConfirm')}
                description={t('deleteConfirmDesc')}
                confirmText={t('delete')}
                cancelText={t('cancel')}
                isDestructive
                isLoading={isSaving}
                onConfirm={handleDelete}
                onCancel={() => setShowDeleteConfirm(false)}
            />
        </div>
    )
}
