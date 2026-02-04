'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, PageHeader } from '@/design'
import AiSettingsForm from './AiSettingsForm'
import type { OrganizationAiSettings } from '@/types/database'
import { updateOrgAiSettings } from '@/lib/ai/settings'
import { UnsavedChangesDialog } from '@/components/settings/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/components/settings/useUnsavedChangesGuard'

interface AiSettingsClientProps {
    initialSettings: Omit<OrganizationAiSettings, 'organization_id' | 'created_at' | 'updated_at'>
}

export default function AiSettingsClient({ initialSettings }: AiSettingsClientProps) {
    const t = useTranslations('aiSettings')
    const tUnsaved = useTranslations('unsavedChanges')
    const initialRef = useRef(initialSettings)
    const [botName, setBotName] = useState(initialSettings.bot_name)
    const [matchThreshold, setMatchThreshold] = useState(initialSettings.match_threshold)
    const [prompt, setPrompt] = useState(initialSettings.prompt)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    const isDirty = useMemo(() => {
        return (
            botName !== initialRef.current.bot_name ||
            matchThreshold !== initialRef.current.match_threshold ||
            prompt !== initialRef.current.prompt
        )
    }, [botName, matchThreshold, prompt])

    useEffect(() => {
        if (isDirty) {
            setSaved(false)
        }
    }, [isDirty])

    const handleSave = async () => {
        setIsSaving(true)
        setSaveError(null)
        setSaved(false)
        try {
            const savedSettings = await updateOrgAiSettings({
                mode: 'flexible',
                bot_name: botName,
                match_threshold: matchThreshold,
                prompt
            })
            initialRef.current = savedSettings
            setBotName(savedSettings.bot_name)
            setMatchThreshold(savedSettings.match_threshold)
            setPrompt(savedSettings.prompt)
            setSaved(true)
            return true
        } catch (error) {
            console.error(error)
            setSaveError(t('saveError'))
            return false
        } finally {
            setIsSaving(false)
        }
    }

    const handleDiscard = () => {
        setBotName(initialRef.current.bot_name)
        setMatchThreshold(initialRef.current.match_threshold)
        setPrompt(initialRef.current.prompt)
        setSaved(false)
        setSaveError(null)
    }

    const guard = useUnsavedChangesGuard({
        isDirty,
        onSave: handleSave,
        onDiscard: handleDiscard
    })

    return (
        <>
            <PageHeader
                title={t('pageTitle')}
                actions={
                    <Button onClick={handleSave} disabled={!isDirty || isSaving}>
                        {isSaving ? t('saving') : t('save')}
                    </Button>
                }
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl mb-6">
                    <p className="text-sm text-gray-500">{t('description')}</p>
                    {saved && <p className="mt-2 text-sm text-green-600">{t('saved')}</p>}
                    {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
                </div>
                <AiSettingsForm
                    botName={botName}
                    matchThreshold={matchThreshold}
                    prompt={prompt}
                    onBotNameChange={setBotName}
                    onMatchThresholdChange={setMatchThreshold}
                    onPromptChange={setPrompt}
                />
            </div>

            <UnsavedChangesDialog
                isOpen={guard.isDialogOpen}
                title={tUnsaved('title')}
                description={tUnsaved('description')}
                stayText={tUnsaved('stay')}
                discardText={tUnsaved('discard')}
                saveText={tUnsaved('save')}
                isSaving={guard.isSaving}
                onStay={guard.closeDialog}
                onDiscard={guard.handleDiscard}
                onSave={guard.handleSave}
            />
        </>
    )
}
