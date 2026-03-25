import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { ChunkLoadRecovery } from '@/components/common/ChunkLoadRecovery'
import '../globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Qualy',
    template: '%s | Qualy',
  },
  description: 'Qualy WhatsApp AI assistant for Turkish SMBs',
  icons: {
    icon: '/icon-black.svg',
    shortcut: '/icon-black.svg',
    apple: '/icon-black.svg',
  },
}

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params

  if (!routing.locales.includes(locale as 'en' | 'tr')) {
    notFound()
  }

  return (
    <html lang={locale}>
      <body className="font-sans antialiased bg-gray-50 text-gray-900" suppressHydrationWarning>
        <ChunkLoadRecovery />
        {children}
      </body>
    </html>
  )
}
