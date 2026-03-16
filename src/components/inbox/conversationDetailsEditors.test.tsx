import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConversationPrivateNoteEditor } from '@/components/inbox/ConversationPrivateNoteEditor'
import { ConversationTagsEditor } from '@/components/inbox/ConversationTagsEditor'

describe('conversation details editors', () => {
  it('keeps the tag input hidden until add mode is opened', () => {
    const markup = renderToStaticMarkup(
      <ConversationTagsEditor
        tags={[]}
        isReadOnly={false}
        labels={{
          noTags: 'No tags',
          add: 'Add',
          cancel: 'Cancel',
          placeholder: 'Type a tag',
          validationTooLong: 'Tags must be 32 characters or fewer.',
          validationTooMany: 'You can add up to 12 tags.',
          requestFailed: 'Save failed.',
        }}
        onSave={async () => ({ ok: true })}
      />
    )

    expect(markup).toContain('Add')
    expect(markup).not.toContain('Type a tag')
    expect(markup).not.toContain('No tags')
  })

  it('keeps an empty private note collapsed until add mode is opened', () => {
    const markup = renderToStaticMarkup(
      <ConversationPrivateNoteEditor
        note=""
        knownPrivateNoteUpdatedAt={null}
        isReadOnly={false}
        labels={{
          placeholder: 'Add internal context for your team...',
          add: 'Add note',
          cancel: 'Cancel',
          save: 'Save note',
          requestFailed: 'Save failed.',
          staleConflict: 'This note changed in another session.',
        }}
        onSave={async () => ({ ok: true })}
      />
    )

    expect(markup).toContain('Add note')
    expect(markup).not.toContain('<textarea')
    expect(markup).not.toContain('Add internal context for your team...')
  })

  it('renders shared note metadata', () => {
    const updatedByText = 'Ayşe'
    const updatedAtText = '16 Mar 2026 12:24'
    const markup = renderToStaticMarkup(
      <ConversationPrivateNoteEditor
        note="Müşteri hafta içi aranmalı"
        knownPrivateNoteUpdatedAt="2026-03-15T10:00:00.000Z"
        updatedByText={updatedByText}
        updatedAtText={updatedAtText}
        isReadOnly={false}
        labels={{
          placeholder: 'Add internal context for your team...',
          add: 'Add note',
          cancel: 'Cancel',
          save: 'Save note',
          requestFailed: 'Save failed.',
          staleConflict: 'This note changed in another session.',
        }}
        onSave={async () => ({ ok: true })}
      />
    )

    expect(markup).toContain('Ayşe')
    expect(markup).toContain('16 Mar 2026 12:24')
    expect(markup).not.toContain('Last updated by')
  })
})
