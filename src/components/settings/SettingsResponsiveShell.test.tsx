import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SETTINGS_SHELL_PATH = path.resolve(process.cwd(), 'src/components/settings/SettingsResponsiveShell.tsx')

describe('SettingsResponsiveShell source', () => {
    it('includes calendar under preferences and apps under integrations', () => {
        const source = fs.readFileSync(SETTINGS_SHELL_PATH, 'utf8')

        expect(source).toContain("id: 'calendar'")
        expect(source).toContain("href: getLocalizedHref(locale, '/settings/calendar')")
        expect(source).toContain("id: 'apps'")
        expect(source).toContain("href: getLocalizedHref(locale, '/settings/apps')")
    })
})

