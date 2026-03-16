'use client'

import type { ResolvedRequiredIntakeItem } from '@/lib/leads/required-intake'

interface ImportantInfoSummaryLabels {
  empty: string
  missing: string
}

interface ImportantInfoSummaryProps {
  items: ResolvedRequiredIntakeItem[]
  labels: ImportantInfoSummaryLabels
}

export function ImportantInfoSummary({ items, labels }: ImportantInfoSummaryProps) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{labels.empty}</p>
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.field} className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {item.field}
          </p>
          <p className={item.value ? 'text-sm text-gray-900' : 'text-sm text-gray-400'}>
            {item.value || labels.missing}
          </p>
        </div>
      ))}
    </div>
  )
}
