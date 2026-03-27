import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InboxComposerActionBar } from '@/components/inbox/InboxComposerActionBar'

describe('InboxComposerActionBar', () => {
  it('uses compact icon-only buttons on mobile and restores labels from the sm breakpoint', () => {
    const templateLabel = 'Templates'
    const sendLabel = 'Send'
    const markup = renderToStaticMarkup(
      <InboxComposerActionBar
        templateLabel={templateLabel}
        sendLabel={sendLabel}
        isTemplateDisabled={false}
        isSendDisabled={false}
        isSending={false}
        onTemplateClick={() => undefined}
        onSendClick={() => undefined}
      />
    )

    expect(markup).toContain(templateLabel)
    expect(markup).toContain(sendLabel)
    expect(markup.match(/h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(markup.match(/w-11/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(markup.match(/px-0/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(markup.match(/sm:w-auto/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(markup.match(/sm:px-3/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(markup.match(/hidden sm:inline/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
