import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE_PATH = path.resolve(process.cwd(), 'src/components/channels/WhatsAppTemplateModal.tsx')

describe('WhatsAppTemplateModal source guard', () => {
  it('avoids synchronously resetting modal state from effects', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).not.toContain("if (!isOpen) return\n        void loadTemplates()")
    expect(source).not.toContain("if (!isOpen) return\n        setRecipientPhone('')")
    expect(source).not.toContain("if (isOpen) return\n        setIsGuideModalOpen(false)")
  })

  it('surfaces WABA guidance and a Meta help link in the modal source', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).toContain('WHATSAPP_OVERVIEW_URL')
    expect(source).toContain("templateTools.requirementLinkLabel")
  })
})
