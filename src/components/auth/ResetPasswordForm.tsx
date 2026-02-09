'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/design'
import { Link } from '@/i18n/navigation'
import { Eye, EyeOff } from 'lucide-react'
import {
    getPasswordRecoveryInputClasses,
    getPasswordRecoveryLinkClasses,
    getPasswordRecoveryPrimaryButtonClasses,
} from '@/components/auth/passwordRecoveryStyles'

type ResetStatus = 'loading' | 'ready' | 'invalid' | 'success'

export default function ResetPasswordForm() {
    const t = useTranslations('auth')
    const tc = useTranslations('common')
    const searchParams = useSearchParams()
    const supabase = useMemo(() => createClient(), [])
    const [status, setStatus] = useState<ResetStatus>('loading')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        let isActive = true
        const init = async () => {
            setStatus('loading')
            setError(null)
            const code = searchParams.get('code')

            if (code) {
                const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
                if (exchangeError) {
                    if (isActive) setStatus('invalid')
                    return
                }
            }

            const { data } = await supabase.auth.getSession()
            if (!isActive) return

            if (data.session) {
                setStatus('ready')
            } else {
                setStatus('invalid')
            }
        }

        init()
        return () => {
            isActive = false
        }
    }, [searchParams, supabase])

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setError(null)

        if (password.length < 6) {
            setError(t('errors.weakPassword'))
            return
        }
        if (password !== confirmPassword) {
            setError(t('errors.passwordMismatch'))
            return
        }

        setIsSubmitting(true)
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) {
            setError(t('errors.generic'))
            setIsSubmitting(false)
            return
        }

        setIsSubmitting(false)
        setStatus('success')
    }

    if (status === 'loading') {
        return (
            <div className="py-8 text-center text-sm text-gray-500">
                <div className="text-center text-sm text-gray-500">{tc('loading')}</div>
            </div>
        )
    }

    if (status === 'invalid') {
        return (
            <div>
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                    {t('resetLinkInvalidTitle')}
                </h1>
                <p className="mt-2 text-sm text-gray-500">{t('resetLinkInvalidDescription')}</p>
                <div className="mt-6">
                    <Link href="/forgot-password" className={getPasswordRecoveryLinkClasses()}>
                        {t('resetLinkInvalidAction')}
                    </Link>
                </div>
            </div>
        )
    }

    if (status === 'success') {
        return (
            <div>
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                    {t('resetPasswordSuccessTitle')}
                </h1>
                <p className="mt-2 text-sm text-gray-500">{t('resetPasswordSuccessDescription')}</p>
                <div className="mt-6">
                    <Link href="/login" className={getPasswordRecoveryLinkClasses()}>
                        {t('backToLogin')}
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div>
            <div className="mb-7">
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                    {t('resetPasswordTitle')}
                </h1>
                <p className="mt-2 text-sm text-gray-500">{t('resetPasswordSubtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                        {t('newPasswordLabel')}
                    </label>
                    <div className="relative mt-2">
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className={getPasswordRecoveryInputClasses({ withTrailingIcon: true })}
                            placeholder={t('passwordPlaceholder')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                            title={showPassword ? t('hidePassword') : t('showPassword')}
                            className="absolute inset-y-0 right-2 inline-flex items-center text-gray-500 hover:text-gray-700"
                        >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>

                <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                        {t('confirmPasswordLabel')}
                    </label>
                    <div className="relative mt-2">
                        <input
                            id="confirmPassword"
                            type={showConfirmPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            className={getPasswordRecoveryInputClasses({ withTrailingIcon: true })}
                            placeholder={t('passwordPlaceholder')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirmPassword((value) => !value)}
                            aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
                            title={showConfirmPassword ? t('hidePassword') : t('showPassword')}
                            className="absolute inset-y-0 right-2 inline-flex items-center text-gray-500 hover:text-gray-700"
                        >
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>

                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className={getPasswordRecoveryPrimaryButtonClasses()}
                >
                    {isSubmitting ? tc('loading') : t('resetPasswordButton')}
                </Button>
            </form>
        </div>
    )
}
