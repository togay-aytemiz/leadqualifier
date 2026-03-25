'use client'

import { Filter } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/design'
import { cn } from '@/lib/utils'
import type {
  InboxLeadTemperatureFilter,
  InboxUnreadFilter,
} from '@/components/inbox/conversationListFilters'

interface InboxListFilterMenuProps {
  unreadFilter: InboxUnreadFilter
  leadTemperatureFilter: InboxLeadTemperatureFilter
  onUnreadFilterChange: (value: InboxUnreadFilter) => void
  onLeadTemperatureFilterChange: (value: InboxLeadTemperatureFilter) => void
  onReset: () => void
}

interface FilterChipOption<Value extends string> {
  value: Value
  label: string
  idleClassName?: string
  selectedClassName?: string
}

function FilterChipGroup<Value extends string>({
  label,
  options,
  selectedValue,
  onChange,
}: {
  label: string
  options: FilterChipOption<Value>[]
  selectedValue: Value
  onChange: (value: Value) => void
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = option.value === selectedValue

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                isSelected
                  ? (option.selectedClassName ??
                    'border-2 border-blue-600 bg-blue-600 text-white shadow-sm')
                  : (option.idleClassName ??
                    'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100')
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function InboxListFilterMenuContent({
  unreadFilter,
  leadTemperatureFilter,
  onUnreadFilterChange,
  onLeadTemperatureFilterChange,
  onReset,
}: InboxListFilterMenuProps) {
  const t = useTranslations('inbox')
  const hasActiveFilters = unreadFilter !== 'all' || leadTemperatureFilter !== 'all'

  return (
    <div className="w-[18rem] max-w-[calc(100vw-2rem)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-3">
        <p className="text-sm font-semibold text-slate-900">{t('conversationFiltersOpen')}</p>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasActiveFilters}
          className="bg-transparent p-0 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700 disabled:cursor-default disabled:text-slate-300"
        >
          {t('conversationFiltersReset')}
        </button>
      </div>
      <div className="space-y-4 p-3.5">
        <FilterChipGroup
          label={t('conversationFiltersUnreadLabel')}
          options={[
            {
              value: 'all',
              label: t('queueTabAll'),
              idleClassName: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
              selectedClassName: 'border-2 border-blue-600 bg-blue-600 text-white shadow-sm',
            },
            {
              value: 'unread',
              label: t('conversationFiltersUnreadUnread'),
              idleClassName: 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50',
              selectedClassName: 'border-2 border-blue-600 bg-blue-600 text-white shadow-sm',
            },
          ]}
          selectedValue={unreadFilter}
          onChange={onUnreadFilterChange}
        />
        <FilterChipGroup
          label={t('conversationFiltersLeadTemperatureLabel')}
          options={[
            {
              value: 'all',
              label: t('queueTabAll'),
              idleClassName: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
              selectedClassName: 'border-2 border-blue-600 bg-blue-600 text-white shadow-sm',
            },
            {
              value: 'hot',
              label: t('leadStatusHot'),
              idleClassName: 'border-red-200 bg-white text-red-700 hover:bg-red-50',
              selectedClassName: 'border-2 border-red-600 bg-red-600 text-white shadow-sm',
            },
            {
              value: 'warm',
              label: t('leadStatusWarm'),
              idleClassName: 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50',
              selectedClassName: 'border-2 border-amber-500 bg-amber-500 text-white shadow-sm',
            },
            {
              value: 'cold',
              label: t('leadStatusCold'),
              idleClassName: 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
              selectedClassName: 'border-2 border-slate-600 bg-slate-600 text-white shadow-sm',
            },
          ]}
          selectedValue={leadTemperatureFilter}
          onChange={onLeadTemperatureFilterChange}
        />
      </div>
    </div>
  )
}

export function InboxListFilterMenu(props: InboxListFilterMenuProps) {
  const t = useTranslations('inbox')
  const hasActiveFilters =
    props.unreadFilter !== 'all' || props.leadTemperatureFilter !== 'all'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('conversationFiltersOpen')}
          title={t('conversationFiltersOpen')}
          className={cn(
            'relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700',
            hasActiveFilters
              ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
              : 'border-slate-200'
          )}
        >
          <Filter size={16} />
          {hasActiveFilters && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl"
      >
        <InboxListFilterMenuContent {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
