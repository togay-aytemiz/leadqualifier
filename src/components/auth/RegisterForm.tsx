'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { register } from '@/lib/auth/actions'
import { Link } from '@/i18n/navigation'

export function RegisterForm() {
    const t = useTranslations('auth')
    const [state, formAction, pending] = useActionState(
        async (_prevState: { error?: string } | null, formData: FormData) => {
            return await register(formData)
        },
        null
    )

    return (
        <div className="rounded-2xl bg-zinc-800/50 p-8 shadow-xl backdrop-blur-sm border border-zinc-700/50">
            <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold text-white">{t('registerTitle')}</h1>
                <p className="mt-2 text-zinc-400">{t('registerSubtitle')}</p>
            </div>

            <form action={formAction} className="space-y-5">
                {state?.error && (
                    <div className="rounded-lg bg-red-500/10 p-4 text-sm text-red-400 border border-red-500/20">
                        {state.error}
                    </div>
                )}

                <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-zinc-300">
                        {t('fullName')}
                    </label>
                    <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        required
                        autoComplete="name"
                        className="mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-700/50 px-4 py-3 text-white placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Ahmet Yılmaz"
                    />
                </div>

                <div>
                    <label htmlFor="companyName" className="block text-sm font-medium text-zinc-300">
                        {t('companyName')}
                    </label>
                    <input
                        id="companyName"
                        name="companyName"
                        type="text"
                        autoComplete="organization"
                        className="mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-700/50 px-4 py-3 text-white placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Şirket Adı (opsiyonel)"
                    />
                </div>

                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
                        {t('email')}
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        className="mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-700/50 px-4 py-3 text-white placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="ornek@email.com"
                    />
                </div>

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
                        {t('password')}
                    </label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        className="mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-700/50 px-4 py-3 text-white placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="••••••••"
                    />
                </div>

                <button
                    type="submit"
                    disabled={pending}
                    className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {pending ? '...' : t('register')}
                </button>
            </form>

            <p className="mt-6 text-center text-sm text-zinc-400">
                {t('hasAccount')}{' '}
                <Link href="/login" className="font-medium text-blue-400 hover:text-blue-300">
                    {t('login')}
                </Link>
            </p>
        </div>
    )
}
