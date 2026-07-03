import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/app/embed/web/[organizationId]/widget.js/route.ts')

describe('web widget script route source', () => {
    it('returns a JavaScript launcher that mounts an organization-scoped web widget iframe', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('content-type')
        expect(source).toContain('application/javascript')
        expect(source).toContain('iframe')
        expect(source).toContain('/embed/web/')
        expect(source).toContain('data-qualy-title')
        expect(source).toContain('data-qualy-subtitle')
        expect(source).toContain('data-qualy-open-label')
        expect(source).toContain('data-qualy-logo-url')
        expect(source).toContain('data-qualy-theme-color')
        expect(source).toContain('data-qualy-show-logo')
        expect(source).toContain('data-qualy-show-launcher-text')
        expect(source).toContain('data-qualy-show-launcher-subtitle')
        expect(source).toContain('data-qualy-show-header-subtitle')
        expect(source).toContain('data-qualy-show-footer')
        expect(source).toContain('data-qualy-footer-text')
        expect(source).toContain('themeColor')
        expect(source).toContain('showLauncherText')
        expect(source).toContain('var markHtml = showLogo')
        expect(source).toContain(": '';\n  var launcherCopyHtml")
        expect(source).toContain('aria-label="\' + safeOpenLabel + \'"')
        expect(source).toContain('qualy-web-widget-close')
        expect(source).toContain("event.origin !== scriptUrl.origin")
        expect(source).not.toContain('/embed/demo/')
        expect(source).not.toContain('qualy-demo-widget-close')
    })
})
