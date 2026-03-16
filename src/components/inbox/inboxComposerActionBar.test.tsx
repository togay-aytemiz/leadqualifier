import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InboxComposerActionBar } from '@/components/inbox/InboxComposerActionBar'

describe('InboxComposerActionBar', () => {
  it('renders visible template and send labels with matching heights', () => {
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
  })
})
