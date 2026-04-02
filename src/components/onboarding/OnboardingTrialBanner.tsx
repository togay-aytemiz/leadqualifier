'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { HiInformationCircle } from 'react-icons/hi2'

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

function compactBannerLinkClassName(variant: 'secondary' | 'primary') {
  return cn(
    'inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-semibold transition-colors',
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-700'
      : 'border border-blue-200 bg-white/80 text-slate-900 hover:bg-white'
  )
}

function mobileInlineUpgradeLinkClassName() {
  return 'font-semibold text-blue-700 underline underline-offset-4 transition-colors hover:text-blue-800'
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
    strong: (chunks) => (
      <strong className="ml-1 inline-block font-semibold text-slate-950">{chunks}</strong>
    ),
  })
  const mobileMessage = t.rich('mobileMessage', {
    days: String(remainingDays),
    date: endsAtLabel,
    strong: (chunks) => (
      <strong className="ml-1 inline-block font-semibold text-slate-950">{chunks}</strong>
    ),
    upgrade: (chunks) => (
      <Link href="/settings/plans" className={mobileInlineUpgradeLinkClassName()}>
        {chunks}
      </Link>
    ),
  })

  return (
    <div className="border-b border-blue-100 bg-blue-50/80 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-blue-600 sm:mt-0 sm:self-center"
            aria-hidden
          >
            <HiInformationCircle className="block h-6 w-6 fill-current" />
          </span>
          <div className="min-w-0 space-y-2 sm:space-y-0">
            <p className="hidden min-w-0 text-sm font-medium leading-6 text-slate-900 sm:flex sm:min-h-6 sm:items-center">
              {message}
            </p>
            <p className="min-w-0 text-sm font-medium leading-6 text-slate-900 sm:hidden">
              {mobileMessage}
            </p>

            {showChecklistCta ? (
              <div className="sm:hidden">
                <Link href="/onboarding" className={compactBannerLinkClassName('secondary')}>
                  {t('checklistCta')}
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-2 sm:flex lg:justify-end">
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
