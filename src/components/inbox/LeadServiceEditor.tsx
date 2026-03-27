'use client'

import { useState } from 'react'

type LeadServiceEditorResult =
  | { ok: true }
  | { ok: false; reason: 'stale_conflict' | 'validation' | 'request_failed' | 'missing_lead' }

type LeadServiceEditorFailureReason = Extract<LeadServiceEditorResult, { ok: false }>['reason']

interface LeadServiceEditorLabels {
  empty: string
  edit: string
  save: string
  cancel: string
  selectPlaceholder: string
  returnToAi: string
  noCatalog: string
  requestFailed: string
  staleConflict: string
  validation: string
}

interface LeadServiceEditorProps {
  currentService: string | null
  currentSource: 'manual' | 'ai' | null
  catalogServices: string[]
  knownLeadUpdatedAt: string | null
  isReadOnly: boolean
  labels: LeadServiceEditorLabels
  onSave: (input: {
    service: string
    knownLeadUpdatedAt: string | null
  }) => Promise<LeadServiceEditorResult>
  onReturnToAi: (input: { knownLeadUpdatedAt: string | null }) => Promise<LeadServiceEditorResult>
}

interface LeadServiceEditorFormProps {
  catalogServices: string[]
  initialService: string | null
  initialKnownLeadUpdatedAt: string | null
  labels: LeadServiceEditorLabels
  onCancel: () => void
  onSave: LeadServiceEditorProps['onSave']
  onSaved: () => void
}

function resolveErrorMessage(
  reason: LeadServiceEditorFailureReason,
  labels: LeadServiceEditorLabels
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

export function LeadServiceEditor({
  currentService,
  currentSource,
  catalogServices,
  knownLeadUpdatedAt,
  isReadOnly,
  labels,
  onSave,
  onReturnToAi,
}: LeadServiceEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isReturningToAi, setIsReturningToAi] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const editSessionKey = `${currentService ?? ''}:${knownLeadUpdatedAt ?? ''}`

  const beginEditing = () => {
    setErrorMessage(null)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setErrorMessage(null)
    setIsEditing(false)
  }

  const handleReturnToAi = async () => {
    setIsReturningToAi(true)
    setErrorMessage(null)

    const result = await onReturnToAi({
      knownLeadUpdatedAt,
    })

    setIsReturningToAi(false)
    if (!result.ok) {
      setErrorMessage(resolveErrorMessage(result.reason, labels))
    }
  }

  if (isEditing) {
    return (
      <LeadServiceEditorForm
        key={editSessionKey}
        catalogServices={catalogServices}
        initialService={currentService}
        initialKnownLeadUpdatedAt={knownLeadUpdatedAt}
        labels={labels}
        onCancel={cancelEditing}
        onSave={onSave}
        onSaved={() => {
          setErrorMessage(null)
          setIsEditing(false)
        }}
      />
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={currentService ? 'text-sm text-gray-900' : 'text-sm text-gray-500'}>
          {currentService || labels.empty}
        </span>

        {!isReadOnly && catalogServices.length > 0 && (
          <button
            type="button"
            onClick={beginEditing}
            className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700"
          >
            {labels.edit}
          </button>
        )}

        {!isReadOnly && currentSource === 'manual' && (
          <button
            type="button"
            onClick={() => void handleReturnToAi()}
            disabled={isReturningToAi}
            className="text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {labels.returnToAi}
          </button>
        )}
      </div>

      {!isReadOnly && catalogServices.length === 0 && (
        <p className="text-xs text-gray-400">{labels.noCatalog}</p>
      )}

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
    </div>
  )
}

function LeadServiceEditorForm({
  catalogServices,
  initialService,
  initialKnownLeadUpdatedAt,
  labels,
  onCancel,
  onSave,
  onSaved,
}: LeadServiceEditorFormProps) {
  const [draftService, setDraftService] = useState(initialService ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSave = async () => {
    setIsSaving(true)
    setErrorMessage(null)

    const result = await onSave({
      service: draftService,
      knownLeadUpdatedAt: initialKnownLeadUpdatedAt,
    })

    setIsSaving(false)
    if (!result.ok) {
      setErrorMessage(resolveErrorMessage(result.reason, labels))
      return
    }

    onSaved()
  }

  return (
    <div className="w-full space-y-2">
      <select
        value={draftService}
        onChange={(event) => setDraftService(event.target.value)}
        disabled={isSaving}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
      >
        <option value="">{labels.selectPlaceholder}</option>
        {catalogServices.map((service) => (
          <option key={service} value={service}>
            {service}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="text-xs font-semibold text-gray-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {labels.cancel}
        </button>
      </div>

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
    </div>
  )
}
