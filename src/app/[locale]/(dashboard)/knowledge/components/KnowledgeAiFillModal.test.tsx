import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE_PATH = path.resolve(
  process.cwd(),
  'src/app/[locale]/(dashboard)/knowledge/components/KnowledgeAiFillModal.tsx'
)

describe('KnowledgeAiFillModal source', () => {
  it('renders the structured ai drafting fields and helper copy', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).not.toContain("t('aiFill.modalEyebrow')")
    expect(source).toContain("t('aiFill.modalTitle')")
    expect(source).toContain("t('aiFill.businessBasicsLabel')")
    expect(source).toContain("t('aiFill.processDetailsLabel')")
    expect(source).toContain("t('aiFill.botGuidelinesLabel')")
    expect(source).toContain("t('aiFill.extraNotesLabel')")
    expect(source).toContain("t('aiFill.reviewBeforeSave')")
  })

  it('uses a mobile-friendly bottom-sheet layout with its own scroll container', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).toContain('createPortal')
    expect(source).toContain('items-end justify-center')
    expect(source).toContain('max-h-[calc(100dvh-0.5rem)]')
    expect(source).toContain('rounded-t-[28px]')
    expect(source).toContain('overflow-y-auto overscroll-contain')
  })

  it('keeps controls disabled while generation is running', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).toContain('const modalOnClose = loading ? () => {} : onClose')
    expect(source).toContain("disabled={loading || !canSubmit}")
    expect(source).toContain("disabled={loading}")
    expect(source).toContain("t('aiFill.loadingTitle')")
    expect(source).toContain("t('aiFill.loadingDescription')")
    expect(source).toContain('animate-spin')
    expect(source).toContain("t('aiFill.generating')")
  })
})
