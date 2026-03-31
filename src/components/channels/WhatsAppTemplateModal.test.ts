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

  it('keeps WABA guidance only inside the how-it-works modal', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source.match(/templateTools\.requirementTitle/g)?.length ?? 0).toBe(1)
    expect(source.match(/templateTools\.requirementBody/g)?.length ?? 0).toBe(1)
    expect(source.match(/templateTools\.requirementLinkLabel/g)?.length ?? 0).toBe(1)
  })

  it('closes the guide modal through a dedicated close handler', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).toContain('const handleGuideModalClose = useCallback(() => {')
    expect(source).not.toContain('onClose={() => setIsGuideModalOpen(false)}')
    expect(source).not.toContain('onClick={() => setIsGuideModalOpen(false)}')
  })
})
