import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PLANS_PAGE_CONTENT_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/PlansSettingsPageContent.tsx'
)

describe('plans page source guard', () => {
    it('surfaces total remaining credits in the current-plan status section', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain('snapshot.totalRemainingCredits')
    })

    it('moves billing region persistence out of the blocking GET render path', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain("import { after } from 'next/server'")
        expect(source).toContain('after(async () => {')
        expect(source).not.toMatch(/const \{ error: billingRegionUpdateError \} = await supabase[\s\S]*?\.update\(\{/)
    })

    it('keeps one-time credit purchase ahead of the custom-package contact CTA', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        const topupCardIndex = source.indexOf('<TopupCheckoutCard')
        const customPackageIndex = source.indexOf("tPlans('packageCatalog.customPackage.title')")

        expect(topupCardIndex).toBeGreaterThan(-1)
        expect(customPackageIndex).toBeGreaterThan(-1)
        expect(topupCardIndex).toBeLessThan(customPackageIndex)
        expect(source).toMatch(/border border-gray-300[\s\S]*bg-white[\s\S]*text-gray-700/)
    })
})
