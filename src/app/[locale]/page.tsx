import { useTranslations } from 'next-intl'

export default function Home() {
    const t = useTranslations('common')

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
            <main className="flex flex-col items-center gap-8 text-center">
                <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">{t('welcome')}</h1>
                <p className="text-lg text-zinc-600 dark:text-zinc-400">
                    WhatsApp AI Lead Qualifier for Turkish SMBs
                </p>
            </main>
        </div>
    )
}
