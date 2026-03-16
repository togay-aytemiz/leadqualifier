import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ImportantInfoSummary } from '@/components/inbox/ImportantInfoSummary'

describe('ImportantInfoSummary', () => {
  it('renders only the compact value rows', () => {
    const markup = renderToStaticMarkup(
      <ImportantInfoSummary
        items={[
          {
            field: 'Bebek Doğum Tarihi',
            value: '',
            source: null,
            updatedAt: null,
            updatedBy: null,
          },
          {
            field: 'Hamilelik Durumu',
            value: '32. hafta',
            source: 'manual',
            updatedAt: '2026-03-16T09:00:00.000Z',
            updatedBy: 'profile-1',
          },
        ]}
        labels={{
          empty: 'No important info',
          missing: 'Not added yet',
        }}
      />
    )

    expect(markup).toContain('Bebek Doğum Tarihi')
    expect(markup).toContain('Not added yet')
    expect(markup).toContain('32. hafta')
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('Edit')
  })
})
