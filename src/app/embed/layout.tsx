import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Qualy Widget Preview',
    template: '%s | Qualy',
  },
  description: 'Qualy embeddable demo chat widget preview',
  icons: {
    icon: '/icon-black.svg',
    shortcut: '/icon-black.svg',
    apple: '/icon-black.svg',
  },
}

type EmbedRootLayoutProps = {
  children: React.ReactNode
}

export default function EmbedRootLayout({ children }: EmbedRootLayoutProps) {
  return (
    <html lang="tr">
      <body className="font-sans antialiased bg-gray-50 text-gray-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
