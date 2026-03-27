import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const APPLICATIONS_SETTINGS_CLIENT_PATH = path.resolve(
    process.cwd(),
    'src/components/settings/ApplicationsSettingsClient.tsx'
)

describe('ApplicationsSettingsClient source', () => {
    it('shows Google Calendar as a passive coming-soon integration and disables save until dirty', () => {
        const source = fs.readFileSync(APPLICATIONS_SETTINGS_CLIENT_PATH, 'utf8')

        expect(source).toContain("t('apps.googleStatusTitle')")
        expect(source).toContain("t('apps.googleComingSoon')")
        expect(source).not.toContain('window.location.assign(googleConnectHref)')
        expect(source).toContain('disabled={isPending || isReadOnly || !isDirty}')
    })
})
