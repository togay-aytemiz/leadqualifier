import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE_PATH = path.resolve(process.cwd(), 'src/components/chat/ChatSimulator.tsx')

describe('ChatSimulator source', () => {
  it('shows a first-visit simulator intro modal scoped by user and organization', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).toContain('WorkspaceIntroModal')
    expect(source).toContain('storageScope="simulator"')
    expect(source).toContain("useTranslations('simulator.introModal')")
    expect(source).toContain('userId')
    expect(source).toContain('organizationId')
  })

  it('renders a second simulator bubble when a matched skill has an image', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf8')

    expect(source).toContain('response.skillImage')
    expect(source).toContain("kind: 'image'")
    expect(source).toContain('setMessages((prev) => [...prev, ...nextMessages])')
  })
})
