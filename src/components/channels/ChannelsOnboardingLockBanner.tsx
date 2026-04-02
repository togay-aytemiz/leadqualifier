'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ChannelsOnboardingLockBannerProps {
  message: string
  description?: string
  ctaLabel?: string
  ctaHref?: string
  className?: string
}

export function ChannelsOnboardingLockBanner({
  message,
  description,
  ctaLabel,
  ctaHref,
  className,
}: ChannelsOnboardingLockBannerProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 shadow-[0_18px_40px_-34px_rgba(124,58,237,0.45)]',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm">
          <Lock size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-6 text-violet-950">{message}</p>
          {description ? <p className="mt-1 text-sm leading-6 text-violet-900/80">{description}</p> : null}
          {ctaLabel && ctaHref ? (
            <Link
              href={ctaHref}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-violet-200 bg-white px-4 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100"
            >
              {ctaLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
