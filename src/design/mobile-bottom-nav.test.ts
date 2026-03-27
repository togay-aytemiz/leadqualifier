import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MOBILE_BOTTOM_NAV_PATH = path.resolve(process.cwd(), 'src/design/MobileBottomNav.tsx')

describe('MobileBottomNav source', () => {
  it('keys the other menu state to the active pathname instead of resetting it in an effect', () => {
    const source = fs.readFileSync(MOBILE_BOTTOM_NAV_PATH, 'utf8')

    expect(source).toContain(
      'const [otherMenuPath, setOtherMenuPath] = useState<string | null>(null)'
    )
    expect(source).toContain('const isOtherOpen = otherMenuPath === pathname')
    expect(source).toContain('activeMenuPath === pathname ? null : pathname')
    expect(source).not.toContain('setIsOtherOpen(false)')
  })

  it('scopes loaded billing snapshots to the active organization before rendering them', () => {
    const source = fs.readFileSync(MOBILE_BOTTOM_NAV_PATH, 'utf8')

    expect(source).toContain('const [loadedBillingSnapshot, setLoadedBillingSnapshot] = useState<')
    expect(source).toContain('loadedBillingSnapshot?.organizationId === activeOrganizationId')
    expect(source).toContain('if (!activeOrganizationId || isDesktopViewport !== false) return')
  })
})
