'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Ear, Power, Sparkles } from 'lucide-react'
import { type ReactNode, useTransition } from 'react'

import { completeOrganizationOnboardingBotModeUnlock } from '@/lib/onboarding/actions'
import type { AiBotMode } from '@/types/database'
import { cn } from '@/lib/utils'

interface OnboardingCompletionModalProps {
  organizationId: string
  isOpen: boolean
  botModeUnlockRequired: boolean
}

type BotModeChoice = Extract<AiBotMode, 'active' | 'shadow' | 'off'>

const optionToneClassMap = {
  active: {
    badge: 'bg-emerald-100 text-emerald-700',
    surface: 'border-emerald-200 bg-emerald-50/80 hover:border-emerald-300 hover:bg-emerald-50',
  },
  shadow: {
    badge: 'bg-amber-100 text-amber-700',
    surface: 'border-amber-200 bg-amber-50/80 hover:border-amber-300 hover:bg-amber-50',
  },
  off: {
    badge: 'bg-slate-100 text-slate-700',
    surface: 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-slate-50',
  },
} as const

export function OnboardingCompletionModal({
  organizationId,
  isOpen,
  botModeUnlockRequired,
}: OnboardingCompletionModalProps) {
  const t = useTranslations('onboarding.completionModal')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!isOpen || !botModeUnlockRequired) {
    return null
  }

  function handleSelect(selectedMode: BotModeChoice) {
    if (isPending) return

    startTransition(async () => {
      try {
        await completeOrganizationOnboardingBotModeUnlock({
          organizationId,
          selectedMode: selectedMode === 'active' ? 'active' : selectedMode === 'shadow' ? 'shadow' : 'off',
        })
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ai-settings-updated'))
        }
        router.refresh()
      } catch (error) {
        console.error('Failed to unlock bot mode after onboarding completion:', error)
      }
    })
  }

  const options: Array<{
    key: BotModeChoice
    selectedMode: BotModeChoice
    icon: ReactNode
    title: string
    body: string
  }> = [
    {
      key: 'shadow',
      selectedMode: 'shadow',
      icon: <Ear size={18} />,
      title: t('options.shadow.title'),
      body: t('options.shadow.body'),
    },
    {
      key: 'active',
      selectedMode: 'active',
      icon: <Sparkles size={18} />,
      title: t('options.active.title'),
      body: t('options.active.body'),
    },
    {
      key: 'off',
      selectedMode: 'off',
      icon: <Power size={18} />,
      title: t('options.off.title'),
      body: t('options.off.body'),
    },
  ]

  return (
    <div className="fixed inset-0 z-[1110] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-3xl border border-violet-200 bg-white p-6 shadow-[0_40px_100px_-40px_rgba(76,29,149,0.5)] sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <CheckCircle2 size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-950">{t('title')}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t('description')}</p>
            <p className="mt-3 text-sm font-medium text-slate-800">{t('currentState')}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {options.map((option) => {
            const toneClasses = optionToneClassMap[option.key]

            return (
              <button
                key={option.key}
                type="button"
                disabled={isPending}
                onClick={() => handleSelect(option.selectedMode)}
                className={cn(
                  'rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70',
                  toneClasses.surface
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-10 w-10 items-center justify-center rounded-2xl',
                    toneClasses.badge
                  )}
                >
                  {option.icon}
                </span>
                <p className="mt-4 text-base font-semibold text-slate-900">{option.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{option.body}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
