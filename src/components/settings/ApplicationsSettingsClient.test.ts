import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const APPLICATIONS_SETTINGS_CLIENT_PATH = path.resolve(
    process.cwd(),
    'src/components/settings/ApplicationsSettingsClient.tsx'
)

describe('ApplicationsSettingsClient source', () => {
    it('uses a short connect CTA and drops the extra Google badge beside status', () => {
        const source = fs.readFileSync(APPLICATIONS_SETTINGS_CLIENT_PATH, 'utf8')

        expect(source).toContain("t('actions.connect')")
        expect(source).not.toContain('Badge variant=')
        expect(source).not.toContain("t('google.title')")
    })
})
