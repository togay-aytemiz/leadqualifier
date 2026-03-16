import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InboxDetailsSection } from '@/components/inbox/InboxDetailsSection'

describe('InboxDetailsSection', () => {
  it('hides the body when collapsed and keeps the header action visible', () => {
    const title = 'Important info'
    const actionLabel = 'Edit'
    const bodyText = 'Hidden body'
    const markup = renderToStaticMarkup(
      <InboxDetailsSection
        title={title}
        isExpanded={false}
        headerAction={<button type="button">{actionLabel}</button>}
      >
        <p>{bodyText}</p>
      </InboxDetailsSection>
    )

    expect(markup).toContain(title)
    expect(markup).toContain(actionLabel)
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain(bodyText)
  })

  it('renders the body and title adornment when expanded', () => {
    const title = 'Person'
    const adornmentLabel = 'AI extraction'
    const bodyText = 'Visible body'
    const markup = renderToStaticMarkup(
      <InboxDetailsSection
        title={title}
        isExpanded={true}
        titleAdornment={<span>{adornmentLabel}</span>}
      >
        <p>{bodyText}</p>
      </InboxDetailsSection>
    )

    expect(markup).toContain(title)
    expect(markup).toContain(adornmentLabel)
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain(bodyText)
  })
})
