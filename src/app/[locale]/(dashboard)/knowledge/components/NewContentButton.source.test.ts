import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const NEW_CONTENT_BUTTON_PATH = path.resolve(
  process.cwd(),
  'src/app/[locale]/(dashboard)/knowledge/components/NewContentButton.tsx'
)

describe('NewContentButton source guards', () => {
  it('keeps coming-soon content sources disabled and non-interactive', () => {
    const source = fs.readFileSync(NEW_CONTENT_BUTTON_PATH, 'utf8')

    expect(source).toContain('disabled: Boolean(opt.badge)')
    expect(source).toContain('disabled={opt.disabled}')
    expect(source).toContain('aria-disabled={opt.disabled}')
    expect(source).toContain('if (opt.disabled) return')
  })
})
