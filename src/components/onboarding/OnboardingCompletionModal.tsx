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
  requiresExplicitSelection: boolean
}

type BotModeChoice = Extract<AiBotMode, 'active' | 'shadow' | 'off'>
type BotModeChoiceTone = 'emerald' | 'amber' | 'rose'

const botModeChoiceToneClassMap: Record<
  BotModeChoiceTone,
  {
    card: string
    icon: string
    dot: string
    title: string
    body: string
  }
> = {
  emerald: {
    card: 'border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100/70',
    icon: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/70',
    dot: 'bg-emerald-500',
    title: 'text-emerald-950',
    body: 'text-emerald-800',
  },
  amber: {
    card: 'border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100/70',
    icon: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200/70',
    dot: 'bg-amber-500',
    title: 'text-amber-950',
    body: 'text-amber-800',
  },
  rose: {
    card: 'border-rose-200 bg-rose-50 hover:border-rose-300 hover:bg-rose-100/70',
    icon: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200/70',
    dot: 'bg-rose-500',
    title: 'text-rose-950',
    body: 'text-rose-800',
  },
}

export function OnboardingCompletionModal({
  organizationId,
  isOpen,
  requiresExplicitSelection,
}: OnboardingCompletionModalProps) {
  const t = useTranslations('onboarding.completionModal')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!isOpen || !requiresExplicitSelection) {
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
    tone: BotModeChoiceTone
  }> = [
    {
      key: 'active',
      selectedMode: 'active',
      icon: <Sparkles size={18} />,
      title: t('options.active.title'),
      body: t('options.active.body'),
      tone: 'emerald',
    },
    {
      key: 'shadow',
      selectedMode: 'shadow',
      icon: <Ear size={18} />,
      title: t('options.shadow.title'),
      body: t('options.shadow.body'),
      tone: 'amber',
    },
    {
      key: 'off',
      selectedMode: 'off',
      icon: <Power size={18} />,
      title: t('options.off.title'),
      body: t('options.off.body'),
      tone: 'rose',
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
            const toneClasses = botModeChoiceToneClassMap[option.tone]

            return (
              <button
                key={option.key}
                type="button"
                disabled={isPending}
                onClick={() => handleSelect(option.selectedMode)}
                className={cn(
                  'rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70',
                  toneClasses.card
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-2xl',
                      toneClasses.icon
                    )}
                  >
                    {option.icon}
                  </span>
                  <span className={cn('h-2.5 w-2.5 rounded-full', toneClasses.dot)} />
                </div>
                <p className={cn('mt-4 text-base font-semibold', toneClasses.title)}>
                  {option.title}
                </p>
                <p className={cn('mt-2 text-sm leading-6', toneClasses.body)}>{option.body}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
