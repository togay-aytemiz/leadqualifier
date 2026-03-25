import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LoginForm } from '@/components/auth/LoginForm'

export async function generateMetadata(): Promise<Metadata> {
  const tAuth = await getTranslations('auth')

  return {
    title: tAuth('login'),
  }
}

export default function LoginPage() {
  return <LoginForm />
}
