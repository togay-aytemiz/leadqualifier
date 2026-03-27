import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LeadServiceEditor } from '@/components/inbox/LeadServiceEditor'

const LEAD_SERVICE_EDITOR_PATH = path.resolve(
  process.cwd(),
  'src/components/inbox/LeadServiceEditor.tsx'
)

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

  it('keys the edit form to the current lead snapshot instead of resyncing draft state in an effect', () => {
    const source = fs.readFileSync(LEAD_SERVICE_EDITOR_PATH, 'utf8')

    expect(source).toContain('const editSessionKey = `${currentService ??')
    expect(source).toContain('<LeadServiceEditorForm')
    expect(source).not.toContain('useEffect(() => {')
  })
})
