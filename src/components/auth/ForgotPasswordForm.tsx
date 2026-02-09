'use client'

import { useActionState, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { requestPasswordReset } from '@/lib/auth/actions'
import { Button } from '@/design'
import { Link } from '@/i18n/navigation'
import {
    getPasswordRecoveryInputClasses,
    getPasswordRecoveryLinkClasses,
    getPasswordRecoveryPrimaryButtonClasses,
} from '@/components/auth/passwordRecoveryStyles'

export default function ForgotPasswordForm() {
    const t = useTranslations('auth')
    const tc = useTranslations('common')
    const locale = useLocale()
    const [cooldown, setCooldown] = useState(0)
    const [state, formAction, pending] = useActionState(
        async (_prevState: { error?: string; success?: boolean } | null, formData: FormData) => {
            return await requestPasswordReset(formData)
        },
        null
    )

    useEffect(() => {
        if (!state?.success) return
        const timer = window.setTimeout(() => setCooldown(120), 0)
        return () => window.clearTimeout(timer)
    }, [state?.success])

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown((prev) => Math.max(prev - 1, 0)), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    const isDisabled = pending || cooldown > 0
    const buttonLabel = cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('sendResetLink')

    return (
        <div>
            <div className="mb-7">
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                    {t('forgotPasswordTitle')}
                </h1>
                <p className="mt-2 text-sm text-gray-500">{t('forgotPasswordSubtitle')}</p>
            </div>

            <form action={formAction} className="space-y-6">
                {state?.error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {t('resetLinkError')}
                    </div>
                )}
                {state?.success && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                        {t('resetLinkSent')}
                    </div>
                )}

                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                        {t('email')}
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        className={`mt-2 ${getPasswordRecoveryInputClasses()}`}
                        placeholder={t('emailPlaceholder')}
                    />
                </div>

                <input type="hidden" name="locale" value={locale} />

                <Button
                    type="submit"
                    disabled={isDisabled}
                    className={getPasswordRecoveryPrimaryButtonClasses()}
                >
                    {pending ? tc('loading') : buttonLabel}
                </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
                <Link href="/login" className={getPasswordRecoveryLinkClasses()}>
                    {t('backToLogin')}
                </Link>
            </p>
        </div>
    )
}
