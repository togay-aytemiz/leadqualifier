import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ImportantInfoEditor } from '@/components/inbox/ImportantInfoEditor'

describe('ImportantInfoEditor', () => {
  it('renders manual source chips and return-to-ai action', () => {
    const markup = renderToStaticMarkup(
      <ImportantInfoEditor
        items={[
          {
            field: 'Telefon',
            value: '0555 111 11 11',
            source: 'manual',
            updatedAt: '2026-03-15T10:00:00.000Z',
            updatedBy: 'profile-1',
          },
          {
            field: 'Bütçe',
            value: '',
            source: null,
            updatedAt: null,
            updatedBy: null,
          },
        ]}
        isReadOnly={false}
        knownLeadUpdatedAt="2026-03-15T10:00:00.000Z"
        labels={{
          ai: 'AI',
          manual: 'Manual',
          edit: 'Edit',
          save: 'Save',
          cancel: 'Cancel',
          returnToAi: 'Return to AI',
          empty: 'No important info collected yet.',
          validation: 'Enter a value.',
          requestFailed: 'Save failed.',
          staleConflict: 'This info changed in another session.',
        }}
        onSave={async () => ({ ok: true })}
        onReturnToAi={async () => ({ ok: true })}
      />
    )

    expect(markup).toContain('Manual')
    expect(markup).toContain('Return to AI')
    expect(markup).toContain('Edit')
    expect(markup).toContain('Bütçe')
  })
})
