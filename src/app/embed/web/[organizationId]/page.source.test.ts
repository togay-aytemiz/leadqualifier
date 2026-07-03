import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/app/embed/web/[organizationId]/page.tsx')

describe('web widget embed page source', () => {
    it('renders the web widget chat client without resolving a public demo channel', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('WebWidgetChatClient')
        expect(source).toContain('organizationId')
        expect(source).toContain('title')
        expect(source).toContain('subtitle')
        expect(source).toContain('logoUrl')
        expect(source).toContain('themeColor')
        expect(source).toContain('showLogo')
        expect(source).toContain('showHeaderSubtitle')
        expect(source).toContain('showFooter')
        expect(source).toContain('footerText')
        expect(source).toContain('readBooleanSearchParam')
        expect(source).toContain('normalizeThemeColor')
        expect(source).not.toContain('resolveDemoChatChannel')
        expect(source).not.toContain('createDemoChatAccessToken')
        expect(source).not.toContain('DemoChatClient')
    })
})
