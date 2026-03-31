'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect, useState } from 'react'
import { AuthSuccessTransition } from '@/components/auth/AuthSuccessTransition'
import { login, type LoginActionState } from '@/lib/auth/actions'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/design'
import { Eye, EyeOff } from 'lucide-react'
import {
    getAuthManualPrefetchRoutes,
    shouldEnableManualRoutePrefetch
} from '@/design/manual-prefetch'

type TranslateFn = (key: string, values?: Record<string, string | number>) => string

function resolveLoginErrorMessage(state: LoginActionState | null, t: TranslateFn) {
    if (!state) return null

    if (state.errorCode === 'invalid_credentials') {
        return t('errors.invalidCredentials')
    }

    return state.error ?? null
}

export function LoginForm() {
    const t = useTranslations('auth')
    const tc = useTranslations('common')
    const locale = useLocale()
    const router = useRouter()
    const [showPassword, setShowPassword] = useState(false)
    const [state, formAction, pending] = useActionState(
        async (_prevState: LoginActionState | null, formData: FormData) => {
            return await login(formData)
        },
        null
    )
    const errorMessage = resolveLoginErrorMessage(state, t)
    const isRedirecting = Boolean(state?.redirectPath)

    useEffect(() => {
        if (!shouldEnableManualRoutePrefetch('auth')) return

        const timeoutId = window.setTimeout(() => {
            getAuthManualPrefetchRoutes('login').forEach((href) => {
                router.prefetch(href)
            })
        }, 120)

        return () => {
            window.clearTimeout(timeoutId)
        }
    }, [router])

    return (
        <div className="relative">
            <AuthSuccessTransition redirectPath={state?.redirectPath} />
            <div className="mb-7">
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{t('loginTitle')}</h1>
                <p className="mt-2 text-sm text-gray-500">{t('loginSubtitle')}</p>
            </div>

            <form action={formAction} className="space-y-6">
                <input type="hidden" name="locale" value={locale} />
                {errorMessage && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {errorMessage}
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
                        className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 focus:border-[#242A40] focus:outline-none focus:ring-2 focus:ring-[#242A40]/10 sm:text-sm"
                        placeholder={t('emailPlaceholder')}
                    />
                </div>

                <div>
                    <div className="flex items-center justify-between">
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                            {t('password')}
                        </label>
                        <Link href="/forgot-password" className="text-sm font-medium text-[#242A40] hover:text-[#1B2033]">
                            {t('forgotPassword')}
                        </Link>
                    </div>
                    <div className="relative mt-2">
                        <input
                            id="password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 text-base text-gray-900 placeholder:text-gray-400 focus:border-[#242A40] focus:outline-none focus:ring-2 focus:ring-[#242A40]/10 sm:text-sm"
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

                <Button
                    type="submit"
                    disabled={pending || isRedirecting}
                    className="h-10 w-full border-transparent bg-[#242A40] text-white hover:bg-[#1B2033]"
                >
                    {pending || isRedirecting ? tc('loading') : t('login')}
                </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
                {t('noAccount')}{' '}
                <Link href="/register" className="font-medium text-[#242A40] hover:text-[#1B2033]">
                    {t('register')}
                </Link>
            </p>
        </div>
    )
}
