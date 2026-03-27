import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PRIMITIVES_PATH = path.resolve(process.cwd(), 'src/design/primitives.tsx')

describe('design primitives source guards', () => {
  it('avoids effect-driven state resets in Avatar and Modal', () => {
    const source = fs.readFileSync(PRIMITIVES_PATH, 'utf8')

    expect(source).not.toContain('setImageFailed(false)')
    expect(source).not.toContain('setShouldRender(true)')
  })

  it('does not render raw img tags inside shared primitives', () => {
    const source = fs.readFileSync(PRIMITIVES_PATH, 'utf8')

    expect(source).not.toContain('<img')
  })
})
