'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useTransition } from 'react'

type LocaleOption = 'en' | 'tr'

const LOCALES: LocaleOption[] = ['tr', 'en']

export function AuthLanguageSwitcher() {
    const t = useTranslations('auth')
    const locale = useLocale() as LocaleOption
    const pathname = usePathname()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const labels: Record<LocaleOption, string> = {
        en: t('languageEnglish'),
        tr: t('languageTurkish'),
    }

    const handleLocaleChange = (nextLocale: LocaleOption) => {
        if (nextLocale === locale) return
        startTransition(() => {
            router.replace(pathname, { locale: nextLocale })
        })
    }

    return (
        <div
            role="group"
            aria-label={t('language')}
            className="inline-flex items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm"
        >
            {LOCALES.map((option) => {
                const isActive = locale === option
                return (
                    <button
                        key={option}
                        type="button"
                        onClick={() => handleLocaleChange(option)}
                        disabled={isPending}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                            isActive
                                ? 'bg-[#242A40] text-white'
                                : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        aria-pressed={isActive}
                    >
                        {labels[option]}
                    </button>
                )
            })}
        </div>
    )
}
