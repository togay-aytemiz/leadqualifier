'use client'

import { Check, CheckCircle2, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

interface OnboardingStepCardProps {
  title: string
  isComplete: boolean
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

export function OnboardingStepCard({
  title,
  isComplete,
  isExpanded,
  onToggle,
  children,
}: OnboardingStepCardProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-[border-color,box-shadow,transform] duration-300 ease-out',
        isExpanded && 'border-violet-200 shadow-[0_18px_40px_-30px_rgba(139,92,246,0.5)]'
      )}
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={onToggle}
        className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-[background-color,color] duration-300 hover:bg-violet-50/40"
      >
        <div className="flex min-w-0 items-center gap-3">
          {isComplete ? (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-[0_10px_20px_-14px_rgba(124,58,237,0.8)]">
              <Check size={12} strokeWidth={3} />
            </span>
          ) : (
            <CheckCircle2
              size={20}
              className={cn(
                'shrink-0 transition-colors duration-300',
                isExpanded ? 'text-violet-500' : 'text-slate-400'
              )}
              strokeWidth={1.8}
            />
          )}
          <span className="min-w-0 text-sm font-semibold text-slate-900 sm:text-base">{title}</span>
        </div>
        <ChevronDown
          size={18}
          className={cn(
            'shrink-0 text-slate-500 transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      <div
        aria-hidden={!isExpanded}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="min-h-0">
          <div
            className={cn(
              'border-t border-slate-200 px-5 py-5 transition-[opacity,transform] duration-300 ease-out',
              isExpanded ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
