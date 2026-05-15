import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/LoginForm'

export async function generateMetadata(): Promise<Metadata> {
  const tAuth = await getTranslations('auth')

  return {
    title: tAuth('login'),
  }
}

type LoginPageProps = {
  searchParams: Promise<{
    auth_error?: string | string[]
    code?: string | string[]
  }>
}

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const code = readSearchParam(params.code).trim()

  if (code) {
    const locale = await getLocale()
    const callbackParams = new URLSearchParams({
      code,
      locale,
    })

    redirect(`/api/auth/callback?${callbackParams.toString()}`)
  }

  const authError = readSearchParam(params.auth_error).trim()

  return (
    <LoginForm
      initialErrorCode={authError === 'confirmation_failed' ? 'confirmation_failed' : null}
    />
  )
}
