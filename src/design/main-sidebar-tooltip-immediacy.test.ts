import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN_SIDEBAR_PATH = path.join(process.cwd(), 'src/design/MainSidebar.tsx')

describe('MainSidebar collapsed tooltip immediacy', () => {
  it('supports an immediate tooltip mode for collapsed nav items', () => {
    const source = fs.readFileSync(MAIN_SIDEBAR_PATH, 'utf8')

    expect(source).toContain('immediate?: boolean')
    expect(source).toContain('immediate = false')
    expect(source).toMatch(/immediate\s*\?\s*'translate-x-0 transition-none'/)
    expect(source).toContain('translate-x-[-2px] transition-all duration-150 ease-out')
    expect(source).toContain("collapsed ? 'overflow-visible' : 'overflow-hidden'")
    expect(source).toContain('<SidebarHoverTooltip')
    expect(source).toContain('content={collapsedNavTooltipContent}')
    expect(source).toContain('immediate')
  })
})
