import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PLANS_PAGE_PATH = path.join(process.cwd(), 'src/app/[locale]/(dashboard)/settings/plans/page.tsx')

describe('plans page source guard', () => {
    it('surfaces total remaining credits in the current-plan status section', () => {
        const source = fs.readFileSync(PLANS_PAGE_PATH, 'utf8')

        expect(source).toContain('snapshot.totalRemainingCredits')
    })
})
