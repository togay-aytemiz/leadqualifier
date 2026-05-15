'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  CalendarDays,
  CircleAlert,
  CheckCircle2,
  Clock3,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { HiOutlineSparkles, HiOutlineSquare3Stack3D } from 'react-icons/hi2'

import { Button } from '@/design'
import {
  acknowledgeOrganizationOnboardingAiSettings,
  acknowledgeOrganizationOnboardingIntro,
  markOrganizationOnboardingSeen,
} from '@/lib/onboarding/actions'
import type {
  OrganizationOnboardingShellState,
  OrganizationOnboardingStepId,
} from '@/lib/onboarding/state'
import { dispatchOnboardingStateUpdated } from '@/lib/onboarding/events'
import { cn } from '@/lib/utils'

import { OnboardingStepCard } from './OnboardingStepCard'

interface OnboardingPageClientProps {
  organizationId: string
  onboardingState: OrganizationOnboardingShellState
  shouldMarkSeenOnMount?: boolean
  isReadOnly?: boolean
  userName?: string | null
}

function actionLinkClassName(variant: 'primary' | 'secondary') {
  return cn(
    'inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors',
    variant === 'primary'
      ? 'border border-violet-600 bg-violet-600 text-white hover:bg-violet-700'
      : 'border border-violet-200 bg-white text-violet-700 hover:bg-violet-50'
  )
}

function StepVisualList({
  items,
  className,
}: {
  items: Array<{ id: string; icon: React.ReactNode; title: string; body?: string }>
  className?: string
}) {
  return (
    <div className={cn('space-y-2.5', className)}>
      {items.map((item) => (
        <div
          key={item.id}
          className={cn('flex gap-3 py-1', item.body ? 'items-start' : 'items-center')}
        >
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 shadow-[0_12px_26px_-22px_rgba(124,58,237,0.8)]',
              item.body ? 'mt-0.5' : 'mt-0'
            )}
          >
            {item.icon}
          </span>
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
            {item.body ? <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function ChannelPreview({
  title,
  whatsappLabel,
  instagramLabel,
  telegramLabel,
  messengerLabel,
  messengerComingSoon,
}: {
  title: string
  whatsappLabel: string
  instagramLabel: string
  telegramLabel: string
  messengerLabel: string
  messengerComingSoon: string
}) {
  return (
    <div className="max-w-2xl">
      <div className="rounded-[28px] border border-violet-200/80 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.98),_rgba(243,240,255,0.92)_48%,_rgba(227,219,255,0.98)_100%)] p-5 shadow-[0_24px_60px_-40px_rgba(124,58,237,0.45)]">
        <p className="text-left text-sm font-semibold text-slate-900">{title}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.35)]">
            <Image src="/whatsapp.svg" alt="" width={28} height={28} className="shrink-0" />
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold text-slate-900">{whatsappLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.35)]">
            <Image src="/instagram.svg" alt="" width={28} height={28} className="shrink-0" />
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold text-slate-900">{instagramLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.35)]">
            <Image src="/Telegram.svg" alt="" width={28} height={28} className="shrink-0" />
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold text-slate-900">{telegramLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-violet-200/90 bg-white/85 p-3 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.35)]">
            <Image src="/messenger.svg" alt="" width={28} height={28} className="shrink-0" />
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold text-slate-900">{messengerLabel}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-violet-600">
                {messengerComingSoon}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function OnboardingPageClient({
  organizationId,
  onboardingState,
  shouldMarkSeenOnMount = false,
  isReadOnly = false,
  userName = null,
}: OnboardingPageClientProps) {
  const t = useTranslations('onboarding.checklist')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimisticCompletedStepIds, setOptimisticCompletedStepIds] = useState<
    Set<OrganizationOnboardingStepId>
  >(new Set())
  const steps = useMemo(
    () =>
      onboardingState.steps.map((step) =>
        optimisticCompletedStepIds.has(step.id) ? { ...step, isComplete: true } : step
      ),
    [onboardingState.steps, optimisticCompletedStepIds]
  )
  const completedSteps = steps.filter((step) => step.isComplete).length
  const totalSteps = steps.length
  const isComplete = completedSteps === totalSteps
  const effectiveOnboardingState = useMemo<OrganizationOnboardingShellState>(
    () => ({
      ...onboardingState,
      isComplete,
      completedSteps,
      totalSteps,
      showChecklistCta: onboardingState.showBanner && !isComplete,
      showNavigationEntry: !isComplete,
      shouldAutoOpen: onboardingState.shouldAutoOpen && !isComplete,
      steps,
    }),
    [completedSteps, isComplete, onboardingState, steps, totalSteps]
  )
  const [expandedStepId, setExpandedStepId] = useState(
    steps.find((step) => step.isExpandedByDefault && !step.isComplete)?.id ??
      steps.find((step) => !step.isComplete)?.id ??
      steps.find((step) => step.isExpandedByDefault)?.id ??
      null
  )
  const hasMarkedSeenRef = useRef(false)

  useEffect(() => {
    dispatchOnboardingStateUpdated({
      organizationId,
      onboardingState: effectiveOnboardingState,
    })
  }, [effectiveOnboardingState, organizationId])

  useEffect(() => {
    if (!shouldMarkSeenOnMount || hasMarkedSeenRef.current) return

    hasMarkedSeenRef.current = true
    void markOrganizationOnboardingSeen(organizationId).catch((error) => {
      console.error('Failed to mark onboarding as seen on mount:', error)
    })
  }, [organizationId, shouldMarkSeenOnMount])

  useEffect(() => {
    if (!expandedStepId) return

    const expandedStep = steps.find((step) => step.id === expandedStepId)
    if (!expandedStep) {
      const nextExpandedStepId =
        steps.find((step) => step.isExpandedByDefault && !step.isComplete)?.id ??
        steps.find((step) => !step.isComplete)?.id ??
        steps.find((step) => step.isExpandedByDefault)?.id ??
        null
      queueMicrotask(() => setExpandedStepId(nextExpandedStepId))
    }
  }, [expandedStepId, steps])

  const progressPercent = totalSteps === 0 ? 0 : (completedSteps / totalSteps) * 100

  function handleIntroAcknowledge() {
    if (isReadOnly || isPending) return

    startTransition(async () => {
      const nextStepId = steps.find((step) => !step.isComplete && step.id !== 'intro')?.id ?? null
      setExpandedStepId(nextStepId)

      try {
        await acknowledgeOrganizationOnboardingIntro(organizationId)
      } catch (error) {
        console.error('Failed to acknowledge onboarding intro:', error)
        return
      }

      router.refresh()
    })
  }

  function handleAiSettingsReview() {
    if (isReadOnly || isPending) return

    startTransition(async () => {
      const nextStepId =
        steps.find((step) => !step.isComplete && step.id !== 'ai_settings_review')?.id ?? null
      setExpandedStepId(nextStepId)

      try {
        await acknowledgeOrganizationOnboardingAiSettings(organizationId)
      } catch (error) {
        console.error('Failed to acknowledge onboarding ai settings review:', error)
      }

      setOptimisticCompletedStepIds((current) => {
        const next = new Set(current)
        next.add('ai_settings_review')
        return next
      })
      router.push('/settings/ai')
    })
  }

  function renderStepBody(stepId: OrganizationOnboardingStepId) {
    if (stepId === 'intro') {
      return (
        <div className="space-y-4 text-left">
          <p className="text-sm leading-7 text-slate-600">{t('steps.intro.description')}</p>
          <StepVisualList
            className="max-w-3xl"
            items={[
              {
                id: 'instant-replies',
                icon: <MessageCircleMore size={18} />,
                title: t('steps.intro.visuals.instantReplies.title'),
                body: t('steps.intro.visuals.instantReplies.body'),
              },
              {
                id: 'lead-info',
                icon: <Sparkles size={18} />,
                title: t('steps.intro.visuals.leadInfo.title'),
                body: t('steps.intro.visuals.leadInfo.body'),
              },
              {
                id: 'appointments',
                icon: <CalendarDays size={18} />,
                title: t('steps.intro.visuals.appointments.title'),
                body: t('steps.intro.visuals.appointments.body'),
              },
              {
                id: 'prioritization',
                icon: <ShieldCheck size={18} />,
                title: t('steps.intro.visuals.prioritization.title'),
                body: t('steps.intro.visuals.prioritization.body'),
              },
            ]}
          />

          <div className="pt-1">
            <Button
              type="button"
              onClick={handleIntroAcknowledge}
              disabled={isReadOnly || isPending}
              className="border-violet-600 bg-violet-600 text-white hover:bg-violet-700"
            >
              {t('steps.intro.primaryCta')}
            </Button>
          </div>
        </div>
      )
    }

    if (stepId === 'agent_setup') {
      return (
        <div className="space-y-4 text-left">
          <p className="text-sm leading-7 text-slate-600">{t('steps.agent_setup.description')}</p>
          <StepVisualList
            className="max-w-3xl"
            items={[
              {
                id: 'knowledge',
                icon: <HiOutlineSquare3Stack3D size={18} />,
                title: t('steps.agent_setup.visuals.knowledge.title'),
                body: t('steps.agent_setup.visuals.knowledge.body'),
              },
              {
                id: 'skills',
                icon: <HiOutlineSparkles size={18} />,
                title: t('steps.agent_setup.visuals.skills.title'),
                body: t('steps.agent_setup.visuals.skills.body'),
              },
              {
                id: 'availability',
                icon: <Clock3 size={18} />,
                title: t('steps.agent_setup.visuals.availability.title'),
                body: t('steps.agent_setup.visuals.availability.body'),
              },
            ]}
          />

          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/knowledge" className={actionLinkClassName('primary')}>
              {t('steps.agent_setup.primaryCta')}
            </Link>
            <Link href="/skills" className={actionLinkClassName('secondary')}>
              {t('steps.agent_setup.secondaryCta')}
            </Link>
          </div>
        </div>
      )
    }

    if (stepId === 'business_review') {
      return (
        <div className="space-y-4 text-left">
          <p className="text-sm leading-7 text-slate-600">{t('steps.business_review.description')}</p>
          <div className="space-y-3">
            <p className="text-left text-sm font-semibold text-slate-900">
              {t('steps.business_review.panelTitle')}
            </p>
            <StepVisualList
              className="max-w-3xl"
              items={[
                {
                  id: 'service-profile',
                  icon: <CheckCircle2 size={18} />,
                  title: t('steps.business_review.checks.serviceProfile'),
                },
                {
                  id: 'required-info',
                  icon: <CheckCircle2 size={18} />,
                  title: t('steps.business_review.checks.requiredInfo'),
                },
                {
                  id: 'service-catalog',
                  icon: <CheckCircle2 size={18} />,
                  title: t('steps.business_review.checks.serviceCatalog'),
                },
              ]}
            />
          </div>

          <div className="pt-1">
            <Link
              href="/settings/organization?focus=organization-details"
              className={actionLinkClassName('primary')}
            >
              {t('steps.business_review.primaryCta')}
            </Link>
          </div>
        </div>
      )
    }

    if (stepId === 'ai_settings_review') {
      return (
        <div className="space-y-4 text-left">
          <p className="text-sm leading-7 text-slate-600">
            {t('steps.ai_settings_review.description')}
          </p>
          <StepVisualList
            className="max-w-3xl"
            items={[
              {
                id: 'bot-mode',
                icon: <Sparkles size={18} />,
                title: t('steps.ai_settings_review.visuals.botMode.title'),
                body: t('steps.ai_settings_review.visuals.botMode.body'),
              },
              {
                id: 'response-logic',
                icon: <MessageCircleMore size={18} />,
                title: t('steps.ai_settings_review.visuals.responseLogic.title'),
                body: t('steps.ai_settings_review.visuals.responseLogic.body'),
              },
              {
                id: 'handover',
                icon: <ShieldCheck size={18} />,
                title: t('steps.ai_settings_review.visuals.handover.title'),
                body: t('steps.ai_settings_review.visuals.handover.body'),
              },
            ]}
          />

          <div className="pt-1">
            <Button
              type="button"
              onClick={handleAiSettingsReview}
              disabled={isReadOnly || isPending}
              className="border-violet-600 bg-violet-600 text-white hover:bg-violet-700"
            >
              {t('steps.ai_settings_review.primaryCta')}
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4 text-left">
        <p className="text-sm leading-7 text-slate-600">{t('steps.connect_whatsapp.description')}</p>
        <ChannelPreview
          title={t('steps.connect_whatsapp.channels.title')}
          whatsappLabel={t('steps.connect_whatsapp.channels.whatsapp.title')}
          instagramLabel={t('steps.connect_whatsapp.channels.instagram.title')}
          telegramLabel={t('steps.connect_whatsapp.channels.telegram.title')}
          messengerLabel={t('steps.connect_whatsapp.channels.messenger.title')}
          messengerComingSoon={t('steps.connect_whatsapp.channels.messenger.comingSoon')}
        />

        <div className="pt-1">
          <Link href="/settings/channels" className={actionLinkClassName('primary')}>
            {t('steps.connect_whatsapp.primaryCta')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f6f7f9]">
      <div className="flex-1 overflow-auto px-4 pt-8 pb-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 text-left">
              <span aria-hidden className="text-[24px] leading-none sm:text-[28px]">
                👋
              </span>
              <h1 className="text-lg font-semibold text-slate-950 sm:text-xl">
                {t('greeting', {
                  name: userName?.trim() || t('defaultName'),
                })}
              </h1>
            </div>

            <div
              className="flex w-full max-w-[190px] items-center gap-3 lg:ml-auto"
              aria-label={t('progressLabel')}
            >
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-300">
                <div
                  className="h-1.5 rounded-full bg-violet-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="min-w-fit whitespace-nowrap text-sm font-medium text-violet-600">
                {completedSteps} / {totalSteps}
              </span>
            </div>
          </div>

          <div className="lg:hidden">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-amber-500">
                <CircleAlert size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {t('recommendedBanner.title')}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {t('recommendedBanner.body')}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {steps.map((step) => (
              <OnboardingStepCard
                key={step.id}
                title={t(`steps.${step.id}.title`)}
                isComplete={step.isComplete}
                isExpanded={expandedStepId === step.id}
                onToggle={() =>
                  setExpandedStepId((currentExpandedStepId) =>
                    currentExpandedStepId === step.id ? null : step.id
                  )
                }
              >
                {renderStepBody(step.id)}
              </OnboardingStepCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
