import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PLANS_STATUS_BANNER_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/PlansStatusBanner.tsx'
)

describe('plans status banner source guard', () => {
    it('auto-cleans transient billing query params after rendering the banner', () => {
        expect(fs.existsSync(PLANS_STATUS_BANNER_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_STATUS_BANNER_PATH)
            ? fs.readFileSync(PLANS_STATUS_BANNER_PATH, 'utf8')
            : ''

        expect(source).toContain('useEffect')
        expect(source).toContain('hasPlansStatusSearch')
        expect(source).toContain('router.replace(`${pathname}${nextQuery}`)')
    })
})
