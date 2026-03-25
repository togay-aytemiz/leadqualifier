import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MailCheck } from 'lucide-react'
import { Link } from '@/i18n/navigation'

interface RegisterCheckEmailPageProps {
  searchParams: Promise<{ email?: string }>
}

function normalizeEmailParam(value: string | undefined) {
  if (!value) return ''
  return value.trim().slice(0, 320)
}

export async function generateMetadata(): Promise<Metadata> {
  const tAuth = await getTranslations('auth')

  return {
    title: tAuth('registerCheckEmailTitle'),
  }
}

export default async function RegisterCheckEmailPage({
  searchParams,
}: RegisterCheckEmailPageProps) {
  const t = await getTranslations('auth')
  const { email: rawEmail } = await searchParams
  const email = normalizeEmailParam(rawEmail)
  const changeEmailHref = email ? `/register?email=${encodeURIComponent(email)}` : '/register'

  return (
    <div>
      <div className="mb-7">
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
          <MailCheck size={20} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          {t('registerCheckEmailTitle')}
        </h1>
        <p className="mt-2 text-sm text-gray-500">{t('registerCheckEmailSubtitle')}</p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t('registerCheckEmailAddressLabel')}
          </p>
          <p className="mt-2 break-all text-sm font-semibold text-gray-900">
            {email || t('registerCheckEmailAddressFallback')}
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t('registerCheckEmailSpamHint')}
        </div>

        <Link
          href={changeEmailHref}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          {t('registerCheckEmailEditEmail')}
        </Link>
      </div>

      <p className="mt-6 text-center text-sm text-gray-500">
        {t('registerCheckEmailSignInHint')}{' '}
        <Link href="/login" className="font-medium text-[#242A40] hover:text-[#1B2033]">
          {t('login')}
        </Link>
      </p>
    </div>
  )
}
