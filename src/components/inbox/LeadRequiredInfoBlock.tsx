'use client'

import type { ResolvedRequiredIntakeItem } from '@/lib/leads/required-intake'
import { ImportantInfoSummary } from '@/components/inbox/ImportantInfoSummary'

interface LeadRequiredInfoBlockLabels {
  empty: string
  missing: string
}

interface LeadRequiredInfoBlockProps {
  title?: string
  editLabel?: string
  onEdit?: () => void
  items: ResolvedRequiredIntakeItem[]
  labels: LeadRequiredInfoBlockLabels
}

export function LeadRequiredInfoBlock({
  title,
  editLabel,
  onEdit,
  items,
  labels,
}: LeadRequiredInfoBlockProps) {
  return (
    <div className="space-y-3">
      {(title || (editLabel && onEdit)) && (
        <div className="flex items-center justify-between gap-3">
          {title ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {title}
            </p>
          ) : (
            <span />
          )}
          {editLabel && onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700"
            >
              {editLabel}
            </button>
          ) : null}
        </div>
      )}
      <ImportantInfoSummary items={items} labels={labels} />
    </div>
  )
}
