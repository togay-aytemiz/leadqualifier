'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useActionState, useEffect, useState } from 'react'
import { register, type RegisterActionState } from '@/lib/auth/actions'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/design'
import {
    getRegisterConsentLinkClasses,
    getRegisterConsentLabelClasses,
    getRegisterConsentTextClasses,
} from '@/components/auth/registerConsentStyles'
import { getRegisterConsentLinks } from '@/components/auth/registerConsentLinks'
import { Eye, EyeOff } from 'lucide-react'
import {
    getAuthManualPrefetchRoutes,
    shouldEnableManualRoutePrefetch
} from '@/design/manual-prefetch'
import Script from 'next/script'

type TranslateFn = (key: string, values?: Record<string, string | number>) => string

function resolveRegisterErrorMessage(state: RegisterActionState | null, t: TranslateFn) {
    if (!state) return null

    if (state.errorCode === 'signup_rate_limited') {
        return t('signupRateLimited', { seconds: Math.max(1, state.cooldownSeconds ?? 0) })
    }

    if (state.errorCode === 'captcha_required') {
        return t('captchaRequired')
    }

    if (state.errorCode === 'captcha_failed') {
        return t('captchaVerificationFailed')
    }

    if (state.errorCode === 'trial_already_used_business') {
        return t('trialAlreadyUsedBusiness')
    }

    return state.error ?? null
}

export function RegisterForm({
    turnstileSiteKey,
    initialEmail = '',
}: {
    turnstileSiteKey: string
    initialEmail?: string
}) {
    const t = useTranslations('auth')
    const tc = useTranslations('common')
    const locale = useLocale()
    const router = useRouter()
    const [showPassword, setShowPassword] = useState(false)
    const consentLinks = getRegisterConsentLinks(locale)
    const [state, formAction, pending] = useActionState(
        async (_prevState: RegisterActionState | null, formData: FormData) => {
            return await register(formData)
        },
        null
    )
    const errorMessage = resolveRegisterErrorMessage(state, t)

    useEffect(() => {
        if (!shouldEnableManualRoutePrefetch()) return

        const timeoutId = window.setTimeout(() => {
            getAuthManualPrefetchRoutes('register').forEach((href) => {
                router.prefetch(href)
            })
        }, 120)

        return () => {
            window.clearTimeout(timeoutId)
        }
    }, [router])

    return (
        <div>
            <div className="mb-7">
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{t('registerTitle')}</h1>
                <p className="mt-2 text-sm text-gray-500">{t('registerSubtitle')}</p>
            </div>

            <form action={formAction} className="space-y-5">
                {errorMessage && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {errorMessage}
                    </div>
                )}

                <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                        {t('fullName')}
                    </label>
                    <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        required
                        autoComplete="name"
                        className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 focus:border-[#242A40] focus:outline-none focus:ring-2 focus:ring-[#242A40]/10 sm:text-sm"
                        placeholder={t('fullNamePlaceholder')}
                    />
                </div>

                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                        {t('email')}
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        defaultValue={initialEmail}
                        autoComplete="email"
                        className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 focus:border-[#242A40] focus:outline-none focus:ring-2 focus:ring-[#242A40]/10 sm:text-sm"
                        placeholder={t('emailPlaceholder')}
                    />
                </div>

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                        {t('password')}
                    </label>
                    <div className="relative mt-2">
                        <input
                            id="password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            autoComplete="new-password"
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

                <input type="hidden" name="companyName" value="" />

                {turnstileSiteKey.length > 0 && (
                    <div className="space-y-2">
                        <Script
                            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                            strategy="afterInteractive"
                        />
                        <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="light" />
                        <p className="text-xs text-gray-500">{t('captchaHelp')}</p>
                    </div>
                )}

                <p className={`${getRegisterConsentLabelClasses()} ${getRegisterConsentTextClasses()}`}>
                    {t.rich('consentNotice', {
                        terms: (chunks) => (
                            <a
                                href={consentLinks.terms.href}
                                target={consentLinks.terms.target}
                                rel={consentLinks.terms.rel}
                                className={getRegisterConsentLinkClasses()}
                            >
                                {chunks}
                            </a>
                        ),
                        privacy: (chunks) => (
                            <a
                                href={consentLinks.privacy.href}
                                target={consentLinks.privacy.target}
                                rel={consentLinks.privacy.rel}
                                className={getRegisterConsentLinkClasses()}
                            >
                                {chunks}
                            </a>
                        ),
                    })}
                </p>
                <p className="text-xs leading-snug text-gray-500">
                    {t.rich('kvkkNotice', {
                        kvkk: (chunks) => (
                            <a
                                href={consentLinks.kvkk.href}
                                target={consentLinks.kvkk.target}
                                rel={consentLinks.kvkk.rel}
                                className={getRegisterConsentLinkClasses()}
                            >
                                {chunks}
                            </a>
                        ),
                    })}
                </p>

                <Button
                    type="submit"
                    disabled={pending}
                    className="h-10 w-full border-transparent bg-[#242A40] text-white hover:bg-[#1B2033]"
                >
                    {pending ? tc('loading') : t('register')}
                </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
                {t('hasAccount')}{' '}
                <Link href="/login" className="font-medium text-[#242A40] hover:text-[#1B2033]">
                    {t('login')}
                </Link>
            </p>
        </div>
    )
}
