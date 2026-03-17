import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SETTINGS_CALENDAR_PAGE_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/settings/calendar/page.tsx')

describe('settings calendar page source', () => {
    it('uses the dedicated settings calendar route guard', () => {
        const source = fs.readFileSync(SETTINGS_CALENDAR_PAGE_PATH, 'utf8')

        expect(source).toContain("currentPath: '/settings/calendar'")
    })
})
