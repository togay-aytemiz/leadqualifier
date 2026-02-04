'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { register } from '@/lib/auth/actions'
import { Link } from '@/i18n/navigation'
import { Button } from '@/design'

export function RegisterForm() {
    const t = useTranslations('auth')
    const tc = useTranslations('common')
    const [state, formAction, pending] = useActionState(
        async (_prevState: { error?: string } | null, formData: FormData) => {
            return await register(formData)
        },
        null
    )

    return (
        <div className="rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
            <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold text-gray-900">{t('registerTitle')}</h1>
                <p className="mt-2 text-sm text-gray-500">{t('registerSubtitle')}</p>
            </div>

            <form action={formAction} className="space-y-5">
                {state?.error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {state.error}
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
                        className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder={t('fullNamePlaceholder')}
                    />
                </div>

                <div>
                    <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">
                        {t('companyName')}
                    </label>
                    <input
                        id="companyName"
                        name="companyName"
                        type="text"
                        autoComplete="organization"
                        className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder={t('companyNamePlaceholder')}
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
                        autoComplete="email"
                        className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder={t('emailPlaceholder')}
                    />
                </div>

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                        {t('password')}
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        className="mt-2 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        placeholder={t('passwordPlaceholder')}
                    />
                </div>

                <Button
                    type="submit"
                    disabled={pending}
                    className="w-full h-10"
                >
                    {pending ? tc('loading') : t('register')}
                </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
                {t('hasAccount')}{' '}
                <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
                    {t('login')}
                </Link>
            </p>
        </div>
    )
}
