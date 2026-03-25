import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { RegisterForm } from '@/components/auth/RegisterForm'

export async function generateMetadata(): Promise<Metadata> {
  const tAuth = await getTranslations('auth')

  return {
    title: tAuth('register'),
  }
}

interface RegisterPageProps {
  searchParams: Promise<{ email?: string }>
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? ''
  const turnstileEnabled = Boolean(turnstileSiteKey && process.env.TURNSTILE_SECRET_KEY?.trim())
  const { email } = await searchParams
  const initialEmail = typeof email === 'string' ? email.trim().slice(0, 320) : ''

  return (
    <RegisterForm
      turnstileSiteKey={turnstileEnabled ? turnstileSiteKey : ''}
      initialEmail={initialEmail}
    />
  )
}
