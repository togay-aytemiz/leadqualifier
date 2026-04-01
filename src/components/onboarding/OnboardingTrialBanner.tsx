'use client'

import Link from 'next/link'
import { Info } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import { cn } from '@/lib/utils'

interface OnboardingTrialBannerProps {
  billingSnapshot: OrganizationBillingSnapshot
  showChecklistCta: boolean
}

function formatTrialEndDate(locale: string, isoDate: string) {
  return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(isoDate))
}

function bannerLinkClassName(variant: 'secondary' | 'primary') {
  return cn(
    'inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors',
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-700'
      : 'border border-slate-300 bg-white/70 text-slate-900 hover:bg-white'
  )
}

export function OnboardingTrialBanner({
  billingSnapshot,
  showChecklistCta,
}: OnboardingTrialBannerProps) {
  const locale = useLocale()
  const t = useTranslations('onboarding.banner')
  const remainingDays = Math.max(0, billingSnapshot.trial.remainingDays)
  const endsAtLabel = formatTrialEndDate(locale, billingSnapshot.trial.endsAt)
  const message = t.rich('message', {
    days: String(remainingDays),
    date: endsAtLabel,
    strong: (chunks) => <strong className="font-semibold text-slate-950">{chunks}</strong>,
  })

  return (
    <div className="border-b border-blue-100 bg-blue-50/80 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
            <Info size={16} />
          </span>
          <p className="min-w-0 text-sm font-medium leading-6 text-slate-900">{message}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {showChecklistCta ? (
            <Link href="/onboarding" className={bannerLinkClassName('secondary')}>
              {t('checklistCta')}
            </Link>
          ) : null}
          <Link href="/settings/plans" className={bannerLinkClassName('primary')}>
            {t('upgradeCta')}
          </Link>
        </div>
      </div>
    </div>
  )
}
