'use client'

import { useActionState, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { requestPasswordReset } from '@/lib/auth/actions'
import { Button } from '@/design'
import { Link } from '@/i18n/navigation'

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
        if (state?.success) {
            setCooldown(120)
        }
    }, [state?.success])

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown((prev) => Math.max(prev - 1, 0)), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    const isDisabled = pending || cooldown > 0
    const buttonLabel = cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('sendResetLink')

    return (
        <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
            <div className="mb-6 text-center">
                <h1 className="text-2xl font-bold text-gray-900">{t('forgotPasswordTitle')}</h1>
                <p className="mt-2 text-sm text-gray-500">{t('forgotPasswordSubtitle')}</p>
            </div>

            <form action={formAction} className="space-y-5">
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
                        className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder={t('emailPlaceholder')}
                    />
                </div>

                <input type="hidden" name="locale" value={locale} />

                <Button type="submit" disabled={isDisabled} className="w-full h-10">
                    {pending ? tc('loading') : buttonLabel}
                </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
                <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
                    {t('backToLogin')}
                </Link>
            </p>
        </div>
    )
}
