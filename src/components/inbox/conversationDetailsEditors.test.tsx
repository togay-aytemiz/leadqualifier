import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConversationPrivateNoteEditor } from '@/components/inbox/ConversationPrivateNoteEditor'
import { ConversationTagsEditor } from '@/components/inbox/ConversationTagsEditor'

describe('conversation details editors', () => {
  it('keeps the tag input hidden until add mode is opened', () => {
    const markup = renderToStaticMarkup(
      <ConversationTagsEditor
        tags={['VIP', 'Hot Lead']}
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

    expect(markup).toContain('VIP')
    expect(markup).toContain('Add')
    expect(markup).not.toContain('Type a tag')
  })

  it('renders shared note metadata', () => {
    const markup = renderToStaticMarkup(
      <ConversationPrivateNoteEditor
        note="Müşteri hafta içi aranmalı"
        knownPrivateNoteUpdatedAt="2026-03-15T10:00:00.000Z"
        updatedMetaText="Last updated by Ayşe"
        isReadOnly={false}
        labels={{
          placeholder: 'Add internal context for your team...',
          save: 'Save note',
          requestFailed: 'Save failed.',
          staleConflict: 'This note changed in another session.',
        }}
        onSave={async () => ({ ok: true })}
      />
    )

    expect(markup).toContain('Ayşe')
    expect(markup).toContain('Save note')
    expect(markup).toContain('rows="3"')
  })
})
