import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE_PATH = path.resolve(process.cwd(), 'src/components/common/WorkspaceIntroModal.tsx')

describe('WorkspaceIntroModal source', () => {
  it('does not render a separate icon block for the intro description row', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).not.toContain('headerIcon: ReactNode')
    expect(source).not.toContain('headerIcon,')
    expect(source).not.toContain('{headerIcon}')
  })
})
