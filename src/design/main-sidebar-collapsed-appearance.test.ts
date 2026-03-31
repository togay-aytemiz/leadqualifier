import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN_SIDEBAR_PATH = path.join(process.cwd(), 'src/design/MainSidebar.tsx')

describe('MainSidebar collapsed appearance source guard', () => {
  it('uses a dark rail palette with inverted branding when collapsed', () => {
    const source = fs.readFileSync(MAIN_SIDEBAR_PATH, 'utf8')

    expect(source).toContain('border-[#2B3354]/90 bg-[#202744] text-slate-100')
    expect(source).toContain("src={collapsed ? '/icon-white.svg' : '/logo-black.svg'}")
    expect(source).toContain(
      'bg-white/10 text-white shadow-none ring-1 ring-white/10 hover:bg-white/16 hover:text-white hover:ring-white/20 focus-visible:ring-white/20'
    )
    expect(source).toContain('bg-white/12 text-white')
  })
})
