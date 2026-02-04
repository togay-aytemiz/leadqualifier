'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button, PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { updateProfile } from '@/lib/profile/actions'
import { UnsavedChangesDialog } from '@/components/settings/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '@/components/settings/useUnsavedChangesGuard'
import { requestPasswordReset } from '@/lib/auth/actions'

interface ProfileSettingsClientProps {
    initialName: string
    email: string
}

export default function ProfileSettingsClient({ initialName, email }: ProfileSettingsClientProps) {
    const t = useTranslations('profileSettings')
    const tUnsaved = useTranslations('unsavedChanges')
    const locale = useLocale()
    const [baseline, setBaseline] = useState({ name: initialName })
    const [name, setName] = useState(initialName)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)
    const [cooldown, setCooldown] = useState(0)
    const [resetState, resetAction, resetPending] = useActionState(
        async (_prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
            return await requestPasswordReset(formData)
        },
        null
    )

    const isDirty = useMemo(() => name !== baseline.name, [name, baseline])

    useEffect(() => {
        if (isDirty) {
            setSaved(false)
        }
    }, [isDirty])

    useEffect(() => {
        if (!saved) return
        const timeout = window.setTimeout(() => {
            setSaved(false)
        }, 2500)
        return () => window.clearTimeout(timeout)
    }, [saved])

    useEffect(() => {
        if (resetState?.success) {
            setCooldown(120)
        }
    }, [resetState?.success])

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown((prev) => Math.max(prev - 1, 0)), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    const handleSave = async () => {
        if (!isDirty) return true
        setIsSaving(true)
        setSaveError(null)
        setSaved(false)
        try {
            await updateProfile(name)
            setBaseline({ name })
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
        setName(baseline.name)
        setSaveError(null)
        setSaved(false)
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
                    <Button
                        onClick={handleSave}
                        disabled={!isDirty || isSaving}
                        className={saved ? 'bg-green-500 hover:bg-green-500 text-white' : undefined}
                    >
                        {saved ? t('saved') : isSaving ? t('saving') : t('save')}
                    </Button>
                }
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl mb-6">
                    <p className="text-sm text-gray-500">{t('description')}</p>
                    {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
                </div>

                <div className="max-w-5xl">
                    <SettingsSection
                        title={t('nameTitle')}
                        description={t('nameDescription')}
                    >
                        <input
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            aria-label={t('nameLabel')}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                        />
                    </SettingsSection>

                    <SettingsSection
                        title={t('emailTitle')}
                        description={t('emailDescription')}
                    >
                        <input
                            type="email"
                            value={email}
                            readOnly
                            aria-label={t('emailLabel')}
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                        />
                        <p className="mt-2 text-xs text-gray-500">{t('emailImmutableNote')}</p>
                    </SettingsSection>

                    <SettingsSection
                        title={t('passwordTitle')}
                        description={t('passwordDescription')}
                    >
                        <form action={resetAction} className="flex flex-wrap items-center gap-3">
                            <input type="hidden" name="email" value={email} />
                            <input type="hidden" name="locale" value={locale} />
                            <Button
                                type="submit"
                                disabled={resetPending || cooldown > 0 || !email}
                            >
                                {cooldown > 0
                                    ? t('passwordResetCooldown', { seconds: cooldown })
                                    : t('passwordChangeButton')}
                            </Button>
                        </form>
                        {resetState?.success && (
                            <p className="mt-2 text-sm text-green-600">{t('passwordResetSent')}</p>
                        )}
                        {resetState?.error && (
                            <p className="mt-2 text-sm text-red-600">{t('passwordResetError')}</p>
                        )}
                    </SettingsSection>
                </div>
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
