import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PLANS_STATUS_BANNER_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/PlansStatusBanner.tsx'
)

describe('plans status banner source guard', () => {
    it('cleans transient billing query params without starting an App Router navigation', () => {
        expect(fs.existsSync(PLANS_STATUS_BANNER_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_STATUS_BANNER_PATH)
            ? fs.readFileSync(PLANS_STATUS_BANNER_PATH, 'utf8')
            : ''

        expect(source).toContain('useEffect')
        expect(source).toContain('hasPlansStatusSearch')
        expect(source).toContain('window.history.replaceState')
        expect(source).not.toContain('useRouter')
        expect(source).not.toContain('router.replace')
    })

    it('keeps the rendered feedback visible after the URL cleanup until dismissed', () => {
        expect(fs.existsSync(PLANS_STATUS_BANNER_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_STATUS_BANNER_PATH)
            ? fs.readFileSync(PLANS_STATUS_BANNER_PATH, 'utf8')
            : ''

        expect(source).toContain('useState(true)')
        expect(source).toContain('setIsVisible(false)')
        expect(source).toContain('if (!isVisible) return null')
    })
})
