'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InboxDetailsSectionProps {
  title: string
  isExpanded: boolean
  onToggle?: () => void
  titleAdornment?: ReactNode
  headerAction?: ReactNode
  className?: string
  bodyClassName?: string
  children?: ReactNode
}

export function InboxDetailsSection({
  title,
  isExpanded,
  onToggle,
  titleAdornment,
  headerAction,
  className,
  bodyClassName,
  children,
}: InboxDetailsSectionProps) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={onToggle}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 text-gray-400 transition-transform duration-200',
              !isExpanded && '-rotate-90'
            )}
          />
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-900">
              {title}
            </span>
            {titleAdornment}
          </span>
        </button>

        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>

      {isExpanded ? <div className={cn('mt-3', bodyClassName)}>{children}</div> : null}
    </section>
  )
}
