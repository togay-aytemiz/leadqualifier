'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { normalizeIntakeFields } from '@/lib/leads/offering-profile-utils'
import { X } from 'lucide-react'

interface RequiredIntakeFieldsSectionProps {
    fields: string[]
    aiFields: string[]
    aiSuggestionsEnabled: boolean
    onAiSuggestionsEnabledChange: (enabled: boolean) => void
    onFieldsChange: (fields: string[]) => void
    onAiFieldsChange: (fields: string[]) => void
}

export function RequiredIntakeFieldsSection({
    fields,
    aiFields,
    aiSuggestionsEnabled,
    onAiSuggestionsEnabledChange,
    onFieldsChange,
    onAiFieldsChange
}: RequiredIntakeFieldsSectionProps) {
    const t = useTranslations('organizationSettings')
    const [isAddingField, setIsAddingField] = useState(false)
    const [fieldInput, setFieldInput] = useState('')

    const aiFieldSet = useMemo(() => {
        return new Set(aiFields.map((field) => field.trim().toLowerCase()).filter(Boolean))
    }, [aiFields])

    const removeField = (field: string) => {
        const nextFields = fields.filter((item) => item !== field)
        const nextAiFields = aiFields.filter((item) => item !== field)
        onFieldsChange(nextFields)
        onAiFieldsChange(nextAiFields)
    }

    const addField = () => {
        const trimmedInput = fieldInput.trim()
        if (!trimmedInput) {
            setIsAddingField(false)
            setFieldInput('')
            return
        }

        const nextFields = normalizeIntakeFields([...fields, trimmedInput])
        onFieldsChange(nextFields)

        const nextAiFields = normalizeIntakeFields(
            aiFields.filter((field) => field.trim().toLowerCase() !== trimmedInput.toLowerCase())
        )
        onAiFieldsChange(nextAiFields)

        setFieldInput('')
        setIsAddingField(false)
    }

    return (
        <SettingsSection title={t('requiredFieldsTitle')} description={t('requiredFieldsDescription')}>
            <div className="space-y-3">
                <div className="space-y-1">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={aiSuggestionsEnabled}
                            onChange={(event) => onAiSuggestionsEnabledChange(event.target.checked)}
                        />
                        {t('requiredFieldsAiToggleLabel')}
                    </label>
                    <p className="text-xs text-gray-500">{t('requiredFieldsAiToggleHelp')}</p>
                </div>

                {fields.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {fields.map((field) => {
                            const isAiField = aiSuggestionsEnabled && aiFieldSet.has(field.trim().toLowerCase())
                            return (
                                <span
                                    key={field}
                                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                                >
                                    <span>{field}</span>
                                    {isAiField && (
                                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                                            {t('requiredFieldsAiTag')}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => removeField(field)}
                                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                                        aria-label={t('requiredFieldsRemove', { field })}
                                    >
                                        <X size={12} strokeWidth={2.5} />
                                    </button>
                                </span>
                            )
                        })}
                    </div>
                )}

                {!isAddingField ? (
                    <Button size="sm" variant="secondary" onClick={() => setIsAddingField(true)}>
                        {t('requiredFieldsManualAdd')}
                    </Button>
                ) : (
                    <input
                        type="text"
                        value={fieldInput}
                        onChange={(event) => setFieldInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return
                            event.preventDefault()
                            addField()
                        }}
                        onBlur={() => {
                            if (!fieldInput.trim()) {
                                setIsAddingField(false)
                            }
                        }}
                        placeholder={t('requiredFieldsManualAddPlaceholder')}
                        aria-label={t('requiredFieldsLabel')}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                    />
                )}
            </div>
        </SettingsSection>
    )
}
