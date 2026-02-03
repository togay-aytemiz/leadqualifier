'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { login } from '@/lib/auth/actions'
import { Link } from '@/i18n/navigation'

export function LoginForm() {
    const t = useTranslations('auth')
    const tc = useTranslations('common')
    const [state, formAction, pending] = useActionState(
        async (_prevState: { error?: string } | null, formData: FormData) => {
            return await login(formData)
        },
        null
    )

    return (
        <div className="rounded-2xl bg-zinc-800/50 p-8 shadow-xl backdrop-blur-sm border border-zinc-700/50">
            <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold text-white">{t('loginTitle')}</h1>
                <p className="mt-2 text-zinc-400">{t('loginSubtitle')}</p>
            </div>

            <form action={formAction} className="space-y-6">
                {state?.error && (
                    <div className="rounded-lg bg-red-500/10 p-4 text-sm text-red-400 border border-red-500/20">
                        {state.error}
                    </div>
                )}

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
                        placeholder={t('emailPlaceholder')}
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
                        autoComplete="current-password"
                        className="mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-700/50 px-4 py-3 text-white placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder={t('passwordPlaceholder')}
                    />
                </div>

                <button
                    type="submit"
                    disabled={pending}
                    className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {pending ? tc('loading') : t('login')}
                </button>
            </form>

            <p className="mt-6 text-center text-sm text-zinc-400">
                {t('noAccount')}{' '}
                <Link href="/register" className="font-medium text-blue-400 hover:text-blue-300">
                    {t('register')}
                </Link>
            </p>
        </div>
    )
}
