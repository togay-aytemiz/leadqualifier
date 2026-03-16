'use client'

import { useEffect, useState } from 'react'
import { normalizeConversationTags } from '@/lib/inbox/conversation-tags'

type ConversationTagsEditorResult =
  | { ok: true }
  | { ok: false; reason: 'validation' | 'request_failed' }

interface ConversationTagsEditorLabels {
  noTags: string
  add: string
  cancel: string
  placeholder: string
  validationTooLong: string
  validationTooMany: string
  requestFailed: string
}

interface ConversationTagsEditorProps {
  tags: string[]
  isReadOnly: boolean
  labels: ConversationTagsEditorLabels
  resolveDisplayLabel?: (tag: string) => string
  onSave: (tags: string[]) => Promise<ConversationTagsEditorResult>
}

function resolveValidationMessage(error: unknown, labels: ConversationTagsEditorLabels) {
  if (!(error instanceof Error)) return labels.requestFailed
  if (error.message === 'tag_too_long') return labels.validationTooLong
  if (error.message === 'too_many_tags') return labels.validationTooMany
  return labels.requestFailed
}

export function ConversationTagsEditor({
  tags,
  isReadOnly,
  labels,
  resolveDisplayLabel,
  onSave,
}: ConversationTagsEditorProps) {
  const [localTags, setLocalTags] = useState(tags)
  const [draftTag, setDraftTag] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setLocalTags(tags)
  }, [tags])

  const persistTags = async (nextTags: string[]) => {
    setIsSaving(true)
    setErrorMessage(null)
    const result = await onSave(nextTags)
    setIsSaving(false)

    if (!result.ok) {
      setErrorMessage(labels.requestFailed)
      return false
    }

    setLocalTags(nextTags)
    return true
  }

  const handleAddTag = async () => {
    const trimmed = draftTag.trim()
    if (!trimmed) return

    try {
      const nextTags = normalizeConversationTags([...localTags, trimmed])
      const saved = await persistTags(nextTags)
      if (saved) {
        setDraftTag('')
        setIsComposerOpen(false)
      }
    } catch (error) {
      setErrorMessage(resolveValidationMessage(error, labels))
    }
  }

  const handleRemoveTag = async (tagToRemove: string) => {
    const nextTags = localTags.filter((tag) => tag !== tagToRemove)
    await persistTags(nextTags)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {localTags.length > 0 ? (
          <>
            {localTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700"
              >
                <span>{resolveDisplayLabel ? resolveDisplayLabel(tag) : tag}</span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => void handleRemoveTag(tag)}
                    disabled={isSaving}
                    className="text-gray-400 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </>
        ) : null}

        {!isReadOnly && !isComposerOpen && (
          <button
            type="button"
            onClick={() => {
              setIsComposerOpen(true)
              setErrorMessage(null)
            }}
            className="inline-flex h-7 items-center rounded-full border border-dashed border-gray-300 px-3 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
          >
            + {labels.add}
          </button>
        )}
      </div>

      {!isReadOnly && isComposerOpen && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draftTag}
            onChange={(event) => setDraftTag(event.target.value)}
            placeholder={labels.placeholder}
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleAddTag()}
            disabled={isSaving}
            className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {labels.add}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftTag('')
              setErrorMessage(null)
              setIsComposerOpen(false)
            }}
            disabled={isSaving}
            className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {labels.cancel}
          </button>
        </div>
      )}

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
    </div>
  )
}
