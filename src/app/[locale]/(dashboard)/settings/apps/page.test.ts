import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SETTINGS_APPS_PAGE_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/settings/apps/page.tsx')

describe('settings apps page source', () => {
    it('uses the dedicated settings apps route guard', () => {
        const source = fs.readFileSync(SETTINGS_APPS_PAGE_PATH, 'utf8')

        expect(source).toContain("currentPath: '/settings/apps'")
    })
})

