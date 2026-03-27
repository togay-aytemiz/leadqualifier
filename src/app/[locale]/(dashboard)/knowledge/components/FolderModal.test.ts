import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/knowledge/components/FolderModal.tsx')

describe('FolderModal source guard', () => {
  it('does not sync draft state with render-time open tracking', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).not.toContain('const [prevOpen, setPrevOpen]')
    expect(source).not.toContain('if (isOpen && !prevOpen)')
    expect(source).not.toContain('setName(initialName)')
  })
})
