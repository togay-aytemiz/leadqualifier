import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('settings channels page source', () => {
  it('uses the full dashboard width instead of a centered max-width shell', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/app/[locale]/(dashboard)/settings/channels/page.tsx'), 'utf8')

    expect(source).not.toContain('max-w-6xl')
    expect(source).toContain('w-full')
  })
})
