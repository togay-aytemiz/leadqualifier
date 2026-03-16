'use client'

import { useEffect, useEffectEvent, useState } from 'react'

type ConversationPrivateNoteEditorResult =
  | { ok: true }
  | { ok: false; reason: 'stale_conflict' | 'validation' | 'request_failed' }

interface ConversationPrivateNoteEditorLabels {
  placeholder: string
  save: string
  requestFailed: string
  staleConflict: string
}

interface ConversationPrivateNoteEditorProps {
  note: string
  knownPrivateNoteUpdatedAt: string | null
  updatedByText?: string | null
  updatedAtText?: string | null
  isReadOnly: boolean
  labels: ConversationPrivateNoteEditorLabels
  onSave: (input: {
    note: string
    knownPrivateNoteUpdatedAt: string | null
  }) => Promise<ConversationPrivateNoteEditorResult>
}

export function ConversationPrivateNoteEditor({
  note,
  knownPrivateNoteUpdatedAt,
  updatedByText,
  updatedAtText,
  isReadOnly,
  labels,
  onSave,
}: ConversationPrivateNoteEditorProps) {
  const [draft, setDraft] = useState(note)
  const [knownUpdatedAt, setKnownUpdatedAt] = useState<string | null>(knownPrivateNoteUpdatedAt)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const syncDraftFromProps = useEffectEvent(
    (nextNote: string, nextKnownUpdatedAt: string | null) => {
      setDraft(nextNote)
      setKnownUpdatedAt(nextKnownUpdatedAt)
      setErrorMessage(null)
    }
  )

  useEffect(() => {
    if (isDirty || isSaving) return
    syncDraftFromProps(note, knownPrivateNoteUpdatedAt)
  }, [isDirty, isSaving, knownPrivateNoteUpdatedAt, note])

  const handleSave = async () => {
    setIsSaving(true)
    setErrorMessage(null)

    const result = await onSave({
      note: draft,
      knownPrivateNoteUpdatedAt: knownUpdatedAt,
    })
    setIsSaving(false)

    if (!result.ok) {
      setErrorMessage(
        result.reason === 'stale_conflict' ? labels.staleConflict : labels.requestFailed
      )
      return
    }

    setIsDirty(false)
  }

  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          setIsDirty(true)
        }}
        rows={3}
        disabled={isReadOnly}
        placeholder={labels.placeholder}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
      />

      <div className="flex items-center justify-between gap-3">
        {updatedByText || updatedAtText ? (
          <div className="space-y-0.5">
            {updatedByText ? <p className="text-xs text-gray-500">{updatedByText}</p> : null}
            {updatedAtText ? <p className="text-xs text-gray-400">{updatedAtText}</p> : null}
          </div>
        ) : (
          <span />
        )}

        {!isReadOnly && (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !isDirty}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {labels.save}
          </button>
        )}
      </div>

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
    </div>
  )
}
