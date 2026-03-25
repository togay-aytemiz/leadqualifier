import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import ResetPasswordForm from '@/components/auth/ResetPasswordForm'

export async function generateMetadata(): Promise<Metadata> {
  const tAuth = await getTranslations('auth')

  return {
    title: tAuth('resetPasswordTitle'),
  }
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
