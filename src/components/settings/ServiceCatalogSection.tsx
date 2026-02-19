'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { normalizeServiceCatalogNames } from '@/lib/leads/offering-profile-utils'
import { X } from 'lucide-react'

interface ServiceCatalogSectionProps {
    services: string[]
    aiServices: string[]
    aiSuggestionsEnabled: boolean
    onAiSuggestionsEnabledChange: (enabled: boolean) => void
    onServicesChange: (services: string[]) => void
}

export function ServiceCatalogSection({
    services,
    aiServices,
    aiSuggestionsEnabled,
    onAiSuggestionsEnabledChange,
    onServicesChange
}: ServiceCatalogSectionProps) {
    const t = useTranslations('organizationSettings')
    const [isAddingService, setIsAddingService] = useState(false)
    const [serviceInput, setServiceInput] = useState('')

    const aiServiceSet = useMemo(() => {
        return new Set(aiServices.map((service) => service.trim().toLowerCase()).filter(Boolean))
    }, [aiServices])

    const removeService = (service: string) => {
        onServicesChange(services.filter((item) => item !== service))
    }

    const addService = () => {
        const trimmedInput = serviceInput.trim()
        if (!trimmedInput) {
            setIsAddingService(false)
            setServiceInput('')
            return
        }

        const nextServices = normalizeServiceCatalogNames([...services, trimmedInput])
        onServicesChange(nextServices)
        setServiceInput('')
        setIsAddingService(false)
    }

    return (
        <SettingsSection title={t('serviceCatalogTitle')} description={t('serviceCatalogDescription')}>
            <div className="space-y-3">
                <div className="space-y-1">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={aiSuggestionsEnabled}
                            onChange={(event) => onAiSuggestionsEnabledChange(event.target.checked)}
                        />
                        {t('serviceCatalogAiToggleLabel')}
                    </label>
                    <p className="text-xs text-gray-500">{t('serviceCatalogAiToggleHelp')}</p>
                </div>

                {services.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {services.map((service) => {
                            const isAiService = aiSuggestionsEnabled && aiServiceSet.has(service.trim().toLowerCase())
                            return (
                                <span
                                    key={service}
                                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                                >
                                    <span>{service}</span>
                                    {isAiService && (
                                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                                            {t('serviceCatalogAiTag')}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => removeService(service)}
                                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                                        aria-label={t('serviceCatalogRemove', { service })}
                                    >
                                        <X size={12} strokeWidth={2.5} />
                                    </button>
                                </span>
                            )
                        })}
                    </div>
                )}

                {!isAddingService ? (
                    <Button size="sm" variant="secondary" onClick={() => setIsAddingService(true)}>
                        {t('serviceCatalogManualAdd')}
                    </Button>
                ) : (
                    <input
                        type="text"
                        value={serviceInput}
                        onChange={(event) => setServiceInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return
                            event.preventDefault()
                            addService()
                        }}
                        onBlur={() => {
                            if (!serviceInput.trim()) {
                                setIsAddingService(false)
                            }
                        }}
                        placeholder={t('serviceCatalogManualAddPlaceholder')}
                        aria-label={t('serviceCatalogLabel')}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                    />
                )}
            </div>
        </SettingsSection>
    )
}
