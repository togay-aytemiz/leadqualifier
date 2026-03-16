import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LeadServiceEditor } from '@/components/inbox/LeadServiceEditor'

describe('LeadServiceEditor', () => {
  it('keeps the service selector collapsed until edit mode is opened', () => {
    const markup = renderToStaticMarkup(
      <LeadServiceEditor
        currentService="Yenidoğan çekimi"
        currentSource="ai"
        catalogServices={['Yenidoğan çekimi', 'Hamile çekimi']}
        knownLeadUpdatedAt="2026-03-16T10:00:00.000Z"
        isReadOnly={false}
        labels={{
          empty: 'Unknown',
          edit: 'Edit',
          save: 'Save',
          cancel: 'Cancel',
          selectPlaceholder: 'Select service',
          returnToAi: 'Return to AI',
          noCatalog: 'No services available',
          requestFailed: 'Save failed.',
          staleConflict: 'This service changed in another session.',
          validation: 'Select a valid service.',
        }}
        onSave={async () => ({ ok: true })}
        onReturnToAi={async () => ({ ok: true })}
      />
    )

    expect(markup).toContain('Yenidoğan çekimi')
    expect(markup).toContain('Edit')
    expect(markup).not.toContain('<select')
    expect(markup).not.toContain('Select service')
  })
})
