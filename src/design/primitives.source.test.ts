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

  it('keeps clickable table rows keyboard accessible', () => {
    const source = fs.readFileSync(PRIMITIVES_PATH, 'utf8')

    expect(source).toContain('onKeyDown={handleKeyDown}')
    expect(source).toContain('tabIndex={onClick ? 0 : undefined}')
    expect(source).toContain('role={onClick ? \'button\' : undefined}')
  })

  it('lets search inputs expose an accessible name', () => {
    const source = fs.readFileSync(PRIMITIVES_PATH, 'utf8')

    expect(source).toContain('aria-label={ariaLabel ?? placeholder}')
    expect(source).toContain('aria-hidden={true}')
  })

  it('exposes shared modals as keyboard-managed dialogs', () => {
    const source = fs.readFileSync(PRIMITIVES_PATH, 'utf8')

    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal={true}')
    expect(source).toContain('aria-labelledby={titleId}')
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain("event.key !== 'Tab'")
    expect(source).toContain('previouslyFocusedElementRef.current?.focus()')
  })
})
