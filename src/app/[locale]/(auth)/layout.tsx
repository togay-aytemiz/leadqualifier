import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { AuthLanguageSwitcher } from '@/components/auth/AuthLanguageSwitcher'
import { AuthMessengerPreview } from '@/components/auth/AuthMessengerPreview'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
    const tc = await getTranslations('common')

    return (
        <div className="min-h-screen bg-[#f3f4f6] px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col">
                <header className="mb-5 flex items-center justify-between">
                    <div className="inline-flex items-center">
                        <Image
                            src="/logo-black.svg"
                            alt={tc('appName')}
                            width={120}
                            height={24}
                            priority
                        />
                    </div>
                    <AuthLanguageSwitcher />
                </header>

                <main className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                    <div className="grid min-h-[calc(100vh-8rem)] lg:grid-cols-2">
                        <section className="flex items-center justify-center p-6 sm:p-10 lg:p-14">
                            <div className="w-full max-w-md">{children}</div>
                        </section>

                        <aside className="relative hidden border-l border-gray-200 bg-gray-50 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:p-12">
                            <div className="absolute inset-0 bg-[radial-gradient(circle,_#d4d4d8_1px,_transparent_1px)] [background-size:18px_18px] opacity-70" />
                            <AuthMessengerPreview />
                        </aside>
                    </div>
                </main>
            </div>
        </div>
    )
}
