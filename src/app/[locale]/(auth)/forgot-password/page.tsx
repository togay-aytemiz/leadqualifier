import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'

export async function generateMetadata(): Promise<Metadata> {
  const tAuth = await getTranslations('auth')

  return {
    title: tAuth('forgotPasswordTitle'),
  }
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
