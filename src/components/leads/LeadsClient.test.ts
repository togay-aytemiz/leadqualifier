import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const LEADS_PAGE_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/leads/page.tsx')
const LEADS_CLIENT_PATH = path.resolve(process.cwd(), 'src/components/leads/LeadsClient.tsx')

describe('Leads client cache source guards', () => {
  it('moves leads interactions onto a client cache seeded from server payload', () => {
    const pageSource = fs.readFileSync(LEADS_PAGE_PATH, 'utf8')
    const clientSource = fs.readFileSync(LEADS_CLIENT_PATH, 'utf8')

    expect(pageSource).toContain('<LeadsClient')
    expect(clientSource).toContain('getLeadsPageData(')
    expect(clientSource).toContain('cacheRef.current.get(cacheKey)')
    expect(clientSource).toContain('window.history.replaceState')
    expect(clientSource).toContain('const [queryState, setQueryState] = useState')
    expect(clientSource).toContain('if (options?.background) {')
    expect(clientSource).toContain('return result')
  })

  it('preserves browser history for client-side leads navigation and restores state on popstate', () => {
    const clientSource = fs.readFileSync(LEADS_CLIENT_PATH, 'utf8')

    expect(clientSource).toContain('window.history.pushState')
    expect(clientSource).toContain("window.addEventListener('popstate'")
    expect(clientSource).toContain("window.removeEventListener('popstate'")
    expect(clientSource).toContain('readLeadsQueryStateFromLocation')
  })
})
