'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/design'
import { Link } from '@/i18n/navigation'

type ResetStatus = 'loading' | 'ready' | 'invalid' | 'success'

export default function ResetPasswordForm() {
    const t = useTranslations('auth')
    const tc = useTranslations('common')
    const searchParams = useSearchParams()
    const supabase = useMemo(() => createClient(), [])
    const [status, setStatus] = useState<ResetStatus>('loading')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
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
            <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
                <div className="text-center text-sm text-gray-500">{tc('loading')}</div>
            </div>
        )
    }

    if (status === 'invalid') {
        return (
            <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
                <h1 className="text-2xl font-bold text-gray-900">{t('resetLinkInvalidTitle')}</h1>
                <p className="mt-2 text-sm text-gray-500">{t('resetLinkInvalidDescription')}</p>
                <div className="mt-6">
                    <Link href="/forgot-password" className="font-medium text-blue-600 hover:text-blue-700">
                        {t('resetLinkInvalidAction')}
                    </Link>
                </div>
            </div>
        )
    }

    if (status === 'success') {
        return (
            <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
                <h1 className="text-2xl font-bold text-gray-900">{t('resetPasswordSuccessTitle')}</h1>
                <p className="mt-2 text-sm text-gray-500">{t('resetPasswordSuccessDescription')}</p>
                <div className="mt-6">
                    <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
                        {t('backToLogin')}
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
            <div className="mb-6 text-center">
                <h1 className="text-2xl font-bold text-gray-900">{t('resetPasswordTitle')}</h1>
                <p className="mt-2 text-sm text-gray-500">{t('resetPasswordSubtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                        {t('newPasswordLabel')}
                    </label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder={t('passwordPlaceholder')}
                    />
                </div>

                <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                        {t('confirmPasswordLabel')}
                    </label>
                    <input
                        id="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder={t('passwordPlaceholder')}
                    />
                </div>

                <Button type="submit" disabled={isSubmitting} className="w-full h-10">
                    {isSubmitting ? tc('loading') : t('resetPasswordButton')}
                </Button>
            </form>
        </div>
    )
}
