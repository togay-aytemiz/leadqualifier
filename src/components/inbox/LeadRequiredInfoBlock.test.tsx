import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LeadRequiredInfoBlock } from '@/components/inbox/LeadRequiredInfoBlock'

describe('LeadRequiredInfoBlock', () => {
  it('renders a compact inline block with one edit action and summary rows', () => {
    const title = 'Collected fields'
    const editLabel = 'Edit'
    const missingValue = 'Not added yet'
    const firstField = 'Baby birth date'
    const secondField = 'Pregnancy status'
    const secondValue = '32 weeks'
    const markup = renderToStaticMarkup(
      <LeadRequiredInfoBlock
        title={title}
        editLabel={editLabel}
        onEdit={() => undefined}
        items={[
          {
            field: firstField,
            value: '',
            source: null,
            updatedAt: null,
            updatedBy: null,
          },
          {
            field: secondField,
            value: secondValue,
            source: 'manual',
            updatedAt: '2026-03-16T09:00:00.000Z',
            updatedBy: 'profile-1',
          },
        ]}
        labels={{
          empty: 'No important info',
          missing: missingValue,
        }}
      />
    )

    expect(markup).toContain(title)
    expect(markup).toContain(editLabel)
    expect(markup).toContain(firstField)
    expect(markup).toContain(secondField)
    expect(markup).toContain(missingValue)
    expect(markup).toContain(secondValue)
    expect(markup).not.toContain('rounded-lg border border-gray-200')
  })
})
