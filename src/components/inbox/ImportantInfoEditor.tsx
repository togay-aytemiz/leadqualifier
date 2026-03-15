'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ResolvedRequiredIntakeItem } from '@/lib/leads/required-intake'

type ImportantInfoEditorResult =
  | { ok: true }
  | { ok: false; reason: 'stale_conflict' | 'validation' | 'request_failed' | 'missing_lead' }

type ImportantInfoEditorFailureReason = Extract<ImportantInfoEditorResult, { ok: false }>['reason']

interface ImportantInfoEditorLabels {
  ai: string
  manual: string
  edit: string
  save: string
  cancel: string
  returnToAi: string
  empty: string
  validation: string
  requestFailed: string
  staleConflict: string
}

interface ImportantInfoEditorProps {
  items: ResolvedRequiredIntakeItem[]
  isReadOnly: boolean
  knownLeadUpdatedAt: string | null
  labels: ImportantInfoEditorLabels
  onSave: (input: {
    field: string
    value: string
    knownLeadUpdatedAt: string | null
  }) => Promise<ImportantInfoEditorResult>
  onReturnToAi: (input: {
    field: string
    knownLeadUpdatedAt: string | null
  }) => Promise<ImportantInfoEditorResult>
}

function resolveErrorMessage(
  reason: ImportantInfoEditorFailureReason,
  labels: ImportantInfoEditorLabels
) {
  switch (reason) {
    case 'stale_conflict':
      return labels.staleConflict
    case 'validation':
      return labels.validation
    default:
      return labels.requestFailed
  }
}

export function ImportantInfoEditor({
  items,
  isReadOnly,
  knownLeadUpdatedAt,
  labels,
  onSave,
  onReturnToAi,
}: ImportantInfoEditorProps) {
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editingLeadUpdatedAt, setEditingLeadUpdatedAt] = useState<string | null>(
    knownLeadUpdatedAt
  )
  const [draftValue, setDraftValue] = useState('')
  const [savingField, setSavingField] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const startEditing = (item: ResolvedRequiredIntakeItem) => {
    setEditingField(item.field)
    setEditingLeadUpdatedAt(knownLeadUpdatedAt)
    setDraftValue(item.value)
    setErrorField(null)
    setErrorMessage(null)
  }

  const cancelEditing = () => {
    setEditingField(null)
    setEditingLeadUpdatedAt(knownLeadUpdatedAt)
    setDraftValue('')
    setErrorField(null)
    setErrorMessage(null)
  }

  const handleSave = async (field: string) => {
    setSavingField(field)
    setErrorField(null)
    setErrorMessage(null)

    const result = await onSave({
      field,
      value: draftValue,
      knownLeadUpdatedAt: editingLeadUpdatedAt,
    })

    if (result.ok) {
      cancelEditing()
      setSavingField(null)
      return
    }

    setSavingField(null)
    setErrorField(field)
    setErrorMessage(resolveErrorMessage(result.reason, labels))
  }

  const handleReturnToAi = async (field: string) => {
    setSavingField(field)
    setErrorField(null)
    setErrorMessage(null)

    const result = await onReturnToAi({
      field,
      knownLeadUpdatedAt,
    })

    if (result.ok) {
      setSavingField(null)
      return
    }

    setSavingField(null)
    setErrorField(field)
    setErrorMessage(resolveErrorMessage(result.reason, labels))
  }

  if (items.length === 0) {
    return <p className="text-sm text-gray-500">{labels.empty}</p>
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isEditing = editingField === item.field
        const isSaving = savingField === item.field
        const sourceLabel = item.source === 'manual' ? labels.manual : labels.ai
        const sourceClasses =
          item.source === 'manual'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-gray-200 bg-gray-50 text-gray-600'

        return (
          <div key={item.field} className="rounded-lg border border-gray-200 bg-white px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{item.field}</span>
                  {item.source && (
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        sourceClasses
                      )}
                    >
                      {sourceLabel}
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <textarea
                    value={draftValue}
                    onChange={(event) => setDraftValue(event.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                ) : item.value ? (
                  <p className="break-words text-sm text-gray-900">{item.value}</p>
                ) : (
                  <p className="text-sm text-gray-400">-</p>
                )}
              </div>

              {!isReadOnly && (
                <div className="shrink-0">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSave(item.field)}
                        disabled={isSaving}
                        className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {labels.save}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={isSaving}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {labels.cancel}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(item)}
                        disabled={isSaving}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {labels.edit}
                      </button>
                      {item.source === 'manual' && (
                        <button
                          type="button"
                          onClick={() => void handleReturnToAi(item.field)}
                          disabled={isSaving}
                          className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {labels.returnToAi}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {errorField === item.field && errorMessage && (
              <p className="mt-2 text-xs text-red-600">{errorMessage}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
